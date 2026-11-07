// Pont serveur entre l'appli VHB Team et Airtable.
// Le jeton Airtable (AIRTABLE_TOKEN) reste ici, côté serveur — jamais exposé au navigateur.
//
// Contrôles appliqués à CHAQUE appel :
//  • une session valide est exigée (dès que le verrou AUTH_ENFORCE vaut "1") ;
//  • seules les tables de l'appli sont accessibles ;
//  • les champs sensibles (mot de passe, jeton) ne sortent jamais et ne s'écrivent pas d'ici ;
//  • la table Utilisateurs est protégée : seul un admin crée, supprime, change un rôle
//    ou un statut ; chacun ne modifie que sa propre fiche.
import { BASE, TOKEN, ENFORCE, SENSITIVE, T_USERS, getSession, can, isAdmin, stripRecord, readBody } from "./_lib.js";

const TABLES = [
  "Pôles", "Utilisateurs", "Tâches", "Commentaires", "Réunions", "Sujets CA", "Réglages", "Notifications",
  "Coûts – Sections", "Coûts – Barèmes", "Coûts – Équipes", "Coûts – Paramètres",
];
// Champs de la fiche Utilisateurs réservés aux administrateurs.
const ADMIN_FIELDS = ["Rôle", "Actif", "Email"];

function url(path) { return "https://api.airtable.com/v0/" + BASE + "/" + path; }
async function at(method, path, body) {
  const res = await fetch(url(path), {
    method,
    headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch (e) { json = { raw: text }; }
  if (!res.ok) throw new Error("Airtable " + res.status + " : " + text);
  return json;
}
const touchesSensitive = (obj) => !!obj && Object.keys(obj).some((k) => SENSITIVE.includes(k));
const mentionsSensitive = (s) => !!s && SENSITIVE.some((k) => String(s).indexOf(k) >= 0);
const clean = (j) => (j && j.records ? { ...j, records: j.records.map(stripRecord) } : j && j.fields ? stripRecord(j) : j);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!TOKEN || !BASE) { res.status(500).json({ error: "Configuration manquante." }); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "POST uniquement" }); return; }
  const b = readBody(req);
  // Les champs calculés par le serveur (préfixe « _ ») ne s'écrivent jamais.
  const dropCalc = (fl) => { if (!fl) return fl; const o = { ...fl }; Object.keys(o).forEach((k) => { if (k.startsWith("_")) delete o[k]; }); return o; };
  if (b.fields) b.fields = dropCalc(b.fields);
  if (Array.isArray(b.records)) b.records = b.records.map((r) => ({ ...r, fields: dropCalc(r.fields) }));
  const { action, table, recordId, fields, records, filterByFormula, sort, field, file, filename, contentType } = b;

  const sess = await getSession(req, res);
  if (!sess && ENFORCE) { res.status(401).json({ error: "Session expirée : reconnecte-toi.", code: "auth" }); return; }

  // ---- Règles d'accès
  if (action !== "uploadAttachment" && !TABLES.includes(table)) { res.status(403).json({ error: "Table non autorisée." }); return; }
  if (sess && !can(sess, "ca")) { res.status(403).json({ error: "Accès non autorisé." }); return; }
  if (mentionsSensitive(filterByFormula) || (sort || []).some((s) => mentionsSensitive(s && s.field))) { res.status(403).json({ error: "Filtre non autorisé." }); return; }
  const writeList = records ? records.map((r) => r.fields) : fields ? [fields] : [];
  if (writeList.some(touchesSensitive) || (action === "uploadAttachment" && SENSITIVE.includes(field))) { res.status(403).json({ error: "Champ protégé." }); return; }

  if (table === T_USERS && sess && !isAdmin(sess)) {
    if (action === "create" || action === "delete") { res.status(403).json({ error: "Réservé aux administrateurs." }); return; }
    if (action === "update") {
      if (recordId !== sess.uid) { res.status(403).json({ error: "Tu ne peux modifier que ta propre fiche." }); return; }
      if (writeList.some((fl) => Object.keys(fl || {}).some((k) => ADMIN_FIELDS.includes(k)))) { res.status(403).json({ error: "Ce champ est réservé aux administrateurs." }); return; }
    }
  }

  try {
    if (action === "uploadAttachment") {
      const r = await fetch("https://content.airtable.com/v0/" + BASE + "/" + recordId + "/" + encodeURIComponent(field) + "/uploadAttachment", {
        method: "POST",
        headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: contentType, file: file, filename: filename }),
      });
      const text = await r.text();
      if (!r.ok) throw new Error("Upload " + r.status + " : " + text);
      res.status(200).json(clean(JSON.parse(text)));
      return;
    }

    const t = encodeURIComponent(table);

    if (action === "list") {
      let all = []; let offset;
      do {
        const params = new URLSearchParams();
        params.set("pageSize", "100");
        if (offset) params.set("offset", offset);
        if (filterByFormula) params.set("filterByFormula", filterByFormula);
        if (sort) sort.forEach((s, i) => { params.set("sort[" + i + "][field]", s.field); if (s.direction) params.set("sort[" + i + "][direction]", s.direction); });
        const j = await at("GET", t + "?" + params.toString());
        all = all.concat(j.records || []); offset = j.offset;
      } while (offset);
      res.status(200).json({ records: all.map(stripRecord) });
      return;
    }
    if (action === "create") { res.status(200).json(clean(await at("POST", t, { records: records || [{ fields }], typecast: true }))); return; }
    if (action === "update") { res.status(200).json(clean(await at("PATCH", t, { records: [{ id: recordId, fields }], typecast: true }))); return; }
    if (action === "delete") { res.status(200).json(await at("DELETE", t + "/" + recordId)); return; }
    res.status(400).json({ error: "Action inconnue : " + action });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
