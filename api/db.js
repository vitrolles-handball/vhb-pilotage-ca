// Pont serveur entre l'appli VHB Team et Airtable.
// Le jeton Airtable (AIRTABLE_TOKEN) reste ici, côté serveur — jamais exposé au navigateur.
//
// Contrôles appliqués à CHAQUE appel :
//  • une session valide est exigée (dès que le verrou AUTH_ENFORCE vaut "1", et toujours
//    pour les tables de la console Admin) ;
//  • chaque table a ses droits de lecture et d'écriture (voir RULES) ;
//  • les champs sensibles (mot de passe, jeton) ne sortent jamais et ne s'écrivent pas d'ici ;
//  • personne ne peut se donner plus de droits qu'il n'en a (rôle Administrateur protégé) ;
//  • les actions sensibles sont inscrites au Journal.
import { BASE, TOKEN, ENFORCE, SENSITIVE, T_USERS, getSession, can, canAny, isAdmin, seesTeam, stripRecord, readBody, logAction, getUser } from "./_lib.js";

const CA = ["ca"];
const ANY = "any";      // toute personne connectée
const NOBODY = [];      // écrit uniquement par le serveur
const READ_PLAYERS = ["eff", "point", "corr", "valid", "compta"];
const READ_PRIMES = ["corr", "valid", "compta", "param"];
// Barème modifiable avec le seul droit « Paramétrer les barèmes » (sans « Gérer les équipes »).
const PRIME_FIELDS = ["Primes actives", "Prime présence", "Prime victoire", "Excusé compte comme"];
// read / write : liste de droits (un seul suffit), ANY, ou NOBODY.
// adminOnly : table nouvelle → session obligatoire même pendant la transition.
const RULES = {
  "Pôles": { read: CA, write: CA }, "Tâches": { read: CA, write: CA }, "Commentaires": { read: CA, write: CA },
  "Réunions": { read: CA, write: CA }, "Sujets CA": { read: CA, write: CA }, "Réglages": { read: CA, write: CA },
  "Coûts – Sections": { read: CA, write: CA }, "Coûts – Barèmes": { read: CA, write: CA },
  "Coûts – Équipes": { read: CA, write: CA }, "Coûts – Paramètres": { read: CA, write: CA },
  "Notifications": { read: ANY, write: ANY },
  "Utilisateurs": { read: ANY, write: ANY /* règles fines plus bas */ },
  "Rôles": { read: ANY, write: ["roles"], strict: true, log: true },
  "Équipes": { read: ANY, write: ["eff", "param"], strict: true, log: true },
  "Staff": { read: ANY, write: ["users", "eff"], strict: true, log: true },
  "Joueurs": { read: READ_PLAYERS, write: ["eff"], strict: true, log: true },
  "Effectifs": { read: READ_PLAYERS, write: ["eff"], strict: true, log: true, teamField: "Équipe" },
  "Journal": { read: ["journal"], write: NOBODY, strict: true },
  "Rythmes": { read: ANY, write: ["plan", "eff"], strict: true, log: true, teamField: "Équipe" },
  "Séances": { read: READ_PLAYERS.concat(["plan"]), write: ["point", "plan", "eff"], strict: true, teamField: "Équipe" },
  // Les pointages passent par /api/pointage (vérification de l'équipe, remplacement en bloc).
  "Pointages": { read: READ_PLAYERS.concat(["plan"]), write: NOBODY, strict: true },
  // Les primes passent par /api/primes (calcul, validation, paiements). Lecture limitée à ses équipes.
  "Primes – Mois": { read: READ_PRIMES, write: NOBODY, strict: true, teamRead: "Équipe" },
  "Primes – Lignes": { read: READ_PRIMES, write: NOBODY, strict: true, teamRead: "Équipe" },
  // Annonces et support passent par /api/annonces et /api/support.
  "Annonces": { read: NOBODY, write: NOBODY, strict: true },
  "Support": { read: NOBODY, write: NOBODY, strict: true },
  "Messages": { read: NOBODY, write: NOBODY, strict: true },
};
// Champs de la fiche Utilisateurs réservés au droit « Gérer les utilisateurs ».
const ADMIN_FIELDS = ["Rôle", "Actif", "Email", "Rôles", "Droits ajoutés"];

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
const allowed = (sess, rule) => rule === ANY ? true : canAny(sess, rule);

// Rôles verrouillés (Administrateur) : seuls les administrateurs les attribuent ou les modifient.
async function lockedRoleIds() {
  const q = new URLSearchParams({ filterByFormula: "{Verrouillé}", pageSize: "100" });
  try { const j = await at("GET", encodeURIComponent("Rôles") + "?" + q.toString()); return (j.records || []).map((r) => r.id); }
  catch (e) { return []; }
}
async function userIsAdmin(rec, locked) {
  const fl = (rec && rec.fields) || {};
  return fl["Rôle"] === "Admin" || (fl["Rôles"] || []).some((id) => locked.includes(id));
}

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
  const isWrite = action !== "list";

  const sess = await getSession(req, res);
  const rule = action === "uploadAttachment" ? null : RULES[table];
  if (action !== "uploadAttachment" && !rule) { res.status(403).json({ error: "Table non autorisée." }); return; }
  if (!sess && (ENFORCE || (rule && rule.strict))) { res.status(401).json({ error: "Session expirée : reconnecte-toi.", code: "auth" }); return; }

  // ---- Règles d'accès générales (uniquement avec une session : pendant la transition,
  //      les anciens accès gardent le fonctionnement d'avant sur les tables du CA)
  if (sess && rule && !allowed(sess, isWrite ? rule.write : rule.read)) { res.status(403).json({ error: "Tu n'as pas le droit d'accéder à ces informations." }); return; }
  if (sess && action === "uploadAttachment" && !can(sess, "ca")) { res.status(403).json({ error: "Accès non autorisé." }); return; }
  if (mentionsSensitive(filterByFormula) || (sort || []).some((s) => mentionsSensitive(s && s.field))) { res.status(403).json({ error: "Filtre non autorisé." }); return; }
  const writeList = records ? records.map((r) => r.fields) : fields ? [fields] : [];
  if (writeList.some(touchesSensitive) || (action === "uploadAttachment" && SENSITIVE.includes(field))) { res.status(403).json({ error: "Champ protégé." }); return; }

  if (sess && table === "Équipes" && isWrite && !can(sess, "eff")) {
    if (action !== "update" || writeList.some((fl) => Object.keys(fl || {}).some((k) => !PRIME_FIELDS.includes(k)))) { res.status(403).json({ error: "Avec le droit « Paramétrer les barèmes », seuls les montants des primes se modifient." }); return; }
  }
  if (sess && table === "Séances" && action === "delete" && !canAny(sess, ["plan", "eff"])) { res.status(403).json({ error: "Seul le responsable du planning peut supprimer une séance." }); return; }
  // ---- Portée « ses équipes » : on n'écrit que dans ses équipes.
  if (sess && isWrite && rule && rule.teamField && sess.scope !== "all") {
    let teamsOk = writeList.every((fl) => ((fl && fl[rule.teamField]) || []).every((t) => seesTeam(sess, t)));
    // Modification / suppression : l'enregistrement existant doit aussi être dans ses équipes.
    if (teamsOk && recordId && (action === "update" || action === "delete")) {
      try { const cur = await at("GET", encodeURIComponent(table) + "/" + encodeURIComponent(recordId)); teamsOk = ((cur.fields || {})[rule.teamField] || []).every((t) => seesTeam(sess, t)); }
      catch (e) { teamsOk = false; }
    }
    if (action === "create" && writeList.some((fl) => !((fl && fl[rule.teamField]) || []).length)) teamsOk = false;
    if (!teamsOk) { res.status(403).json({ error: "Cette équipe ne fait pas partie des tiennes." }); return; }
  }

  // ---- Utilisateurs : chacun sa fiche ; le reste exige « Gérer les utilisateurs ».
  if (table === T_USERS && sess && isWrite && !isAdmin(sess)) {
    const manage = can(sess, "users");
    const touchesAdmin = writeList.some((fl) => Object.keys(fl || {}).some((k) => ADMIN_FIELDS.includes(k)));
    if ((action === "create" || action === "delete") && !manage) { res.status(403).json({ error: "Réservé aux personnes qui gèrent les utilisateurs." }); return; }
    if (action === "update" && recordId !== sess.uid && !manage) { res.status(403).json({ error: "Tu ne peux modifier que ta propre fiche." }); return; }
    if (touchesAdmin && !manage) { res.status(403).json({ error: "Ce champ est réservé aux personnes qui gèrent les utilisateurs." }); return; }
    if (manage) {
      const locked = await lockedRoleIds();
      // Personne ne s'attribue (ni n'attribue) le rôle Administrateur sans l'être.
      if (writeList.some((fl) => fl && ((fl["Rôle"] === "Admin") || (fl["Rôles"] || []).some((id) => locked.includes(id))))) { res.status(403).json({ error: "Seul un administrateur peut nommer un administrateur." }); return; }
      // Ni ne modifie / supprime un administrateur.
      if (recordId && recordId !== sess.uid) {
        const target = await getUser(recordId);
        if (await userIsAdmin(target, locked)) { res.status(403).json({ error: "Seul un administrateur peut modifier un autre administrateur." }); return; }
      }
      // Ni ne se donne à soi-même des rôles ou des droits.
      if (recordId === sess.uid && writeList.some((fl) => fl && ("Rôles" in fl || "Droits ajoutés" in fl || "Rôle" in fl))) { res.status(403).json({ error: "Tu ne peux pas modifier tes propres droits : demande à un administrateur." }); return; }
    }
  }
  // ---- Rôles : le rôle Administrateur ne se modifie pas.
  if (table === "Rôles" && sess && isWrite) {
    const locked = await lockedRoleIds();
    if (recordId && locked.includes(recordId)) { res.status(403).json({ error: "Le rôle Administrateur est verrouillé." }); return; }
    if (writeList.some((fl) => fl && fl["Verrouillé"]) && !isAdmin(sess)) { res.status(403).json({ error: "Seul un administrateur peut verrouiller un rôle." }); return; }
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
    const shouldLog = sess && isWrite && (rule.log || (table === T_USERS && writeList.some((fl) => Object.keys(fl || {}).some((k) => ADMIN_FIELDS.includes(k)))) || (table === T_USERS && action !== "update"));

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
      if (rule.teamRead && sess && sess.scope !== "all") all = all.filter((r) => ((r.fields || {})[rule.teamRead] || []).some((tm) => seesTeam(sess, tm)));
      res.status(200).json({ records: all.map(stripRecord) });
      return;
    }
    let out;
    if (action === "create") {
      const recs = records || [{ fields }];
      out = { records: [] };
      for (let i = 0; i < recs.length; i += 10) { // Airtable : 10 enregistrements par appel
        const j = await at("POST", t, { records: recs.slice(i, i + 10), typecast: true });
        out.records = out.records.concat(j.records || []);
      }
      if (shouldLog) await logAction(sess, "Création", table, out.records.map((r) => r.id).join(", "), recs.length > 3 ? recs.length + " enregistrements" : recs.map((r) => r.fields));
    } else if (action === "update") {
      out = await at("PATCH", t, { records: [{ id: recordId, fields }], typecast: true });
      if (shouldLog) await logAction(sess, "Modification", table, recordId, fields);
    } else if (action === "delete") {
      out = await at("DELETE", t + "/" + recordId);
      if (shouldLog) await logAction(sess, "Suppression", table, recordId, "");
    } else { res.status(400).json({ error: "Action inconnue : " + action }); return; }
    res.status(200).json(clean(out));
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
