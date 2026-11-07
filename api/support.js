// Aide & support : « Signaler un problème », « Mes demandes », file de traitement.
// POST { action, ... } — session obligatoire.
//   create { type, texte, page, infos, capture? { filename, contentType, data (base64) } } → toute personne connectée
//   mine                                   → mes demandes et leurs réponses
//   all    { statut? }                     → toutes les demandes — droit « Traiter le support »
//   update { id, statut?, reponse? }       → répondre / changer le statut — droit « Traiter le support » (l'auteur est prévenu)
import { at, BASE, TOKEN, getSession, can, readBody, logAction, appUrl } from "./_lib.js";
import { notifyUsers, rightsOf, hasRight, esc } from "./_notify.js";

const T = (n) => encodeURIComponent(n);
const fv = (r, k) => ((r && r.fields) || {})[k];
const isId = (x) => typeof x === "string" && /^[A-Za-z0-9]{2,24}$/.test(x);
const TYPES = ["Bug", "Question", "Idée"], STATUTS = ["Nouveau", "En cours", "Résolu"];
const nameOf = (u) => (((fv(u, "Prénom") || "") + " " + (fv(u, "Nom") || "")).trim() || fv(u, "Email") || "Membre");

async function listAll(table, formula) {
  let all = [], offset;
  do {
    const q = new URLSearchParams({ pageSize: "100" });
    if (formula) q.set("filterByFormula", formula);
    if (offset) q.set("offset", offset);
    const j = await at("GET", table + "?" + q.toString());
    all = all.concat(j.records || []); offset = j.offset;
  } while (offset);
  return all;
}
const shape = (r, users) => {
  const u = users.find((x) => x.id === (fv(r, "Auteur") || [])[0]);
  const by = users.find((x) => x.id === (fv(r, "Répondu par") || [])[0]);
  return { id: r.id, type: fv(r, "Type") || "Question", texte: fv(r, "Texte") || "", page: fv(r, "Page") || "", infos: fv(r, "Infos techniques") || "", date: fv(r, "Date"), statut: fv(r, "Statut") || "Nouveau", reponse: fv(r, "Réponse") || "", reponduLe: fv(r, "Répondu le") || null, reponduPar: by ? nameOf(by) : null, auteur: u ? nameOf(u) : "Membre", auteurId: u ? u.id : null, captures: (fv(r, "Capture") || []).map((c) => ({ url: c.url, name: c.filename, thumb: c.thumbnails && c.thumbnails.large ? c.thumbnails.large.url : c.url })) };
};

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.status(405).json({ error: "POST uniquement" }); return; }
  const sess = await getSession(req, res);
  if (!sess) { res.status(401).json({ error: "Session expirée : reconnecte-toi.", code: "auth" }); return; }
  const b = readBody(req);
  try {
    if (b.action === "create") {
      const type = TYPES.includes(b.type) ? b.type : "Question";
      const texte = String(b.texte || "").trim().slice(0, 4000);
      if (texte.length < 5) { res.status(400).json({ error: "Décris ton problème ou ta question en quelques mots." }); return; }
      const now = new Date().toISOString();
      const rec = (await at("POST", T("Support"), { records: [{ fields: { "Libellé": type + " · " + texte.replace(/\s+/g, " ").slice(0, 60), "Auteur": [sess.uid], "Date": now, "Type": type, "Texte": texte, "Page": String(b.page || "").slice(0, 120), "Infos techniques": String(b.infos || "").slice(0, 2000), "Statut": "Nouveau" } }], typecast: true })).records[0];
      // Capture d'écran (facultative, image ≤ 4 Mo).
      let capture = false;
      const c = b.capture;
      if (c && typeof c.data === "string" && /^image\/(png|jpeg|webp)$/.test(String(c.contentType || "")) && c.data.length < 5.6e6) {
        try {
          const r = await fetch("https://content.airtable.com/v0/" + BASE + "/" + rec.id + "/" + T("Capture") + "/uploadAttachment", { method: "POST", headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" }, body: JSON.stringify({ contentType: c.contentType, file: c.data, filename: String(c.filename || "capture.jpg").slice(0, 80) }) });
          capture = r.ok;
        } catch (e) {}
      }
      // Prévenir les personnes qui traitent le support.
      const [users, roles] = await Promise.all([listAll(T("Utilisateurs")), listAll(T("Rôles"))]);
      const me = users.find((u) => u.id === sess.uid);
      const team = users.filter((u) => u.id !== sess.uid && fv(u, "Actif") !== false && hasRight(rightsOf(u, roles), "support"));
      const url = appUrl(req) + "/?support=" + rec.id;
      if (team.length) await notifyUsers(team, {
        title: "🛟 " + type + " signalé par " + nameOf(me), body: texte.replace(/\s+/g, " ").slice(0, 160), url: "/?support=" + rec.id,
        mail: { wanted: true, subject: "VHB Team · Support : " + type.toLowerCase() + " de " + nameOf(me), title: "Nouvelle demande : " + type, html: '<p style="color:#555">De <b>' + esc(nameOf(me)) + "</b>" + (b.page ? " · page « " + esc(b.page) + " »" : "") + '</p><div style="white-space:pre-wrap;font-size:15px;line-height:1.55">' + esc(texte) + "</div>", cta: { url, label: "Ouvrir la demande" } },
      });
      res.status(200).json({ ok: true, id: rec.id, capture, notified: team.length });
      return;
    }

    if (b.action === "mine") {
      const me = await at("GET", T("Utilisateurs") + "/" + sess.uid);
      const ids = fv(me, "Demandes support") || [];
      const recs = ids.length ? await listAll(T("Support"), "OR(" + ids.slice(-60).map((id) => "RECORD_ID()='" + id + "'").join(",") + ")") : [];
      const users = await listAll(T("Utilisateurs"));
      res.status(200).json({ items: recs.map((r) => shape(r, users)).sort((a, c) => String(c.date).localeCompare(String(a.date))) });
      return;
    }

    if (!can(sess, "support")) { res.status(403).json({ error: "Réservé aux personnes qui traitent le support." }); return; }
    if (b.action === "all") {
      const [recs, users] = await Promise.all([listAll(T("Support")), listAll(T("Utilisateurs"))]);
      res.status(200).json({ items: recs.map((r) => shape(r, users)).sort((a, c) => String(c.date).localeCompare(String(a.date))) });
      return;
    }
    if (b.action === "update") {
      if (!isId(b.id)) { res.status(400).json({ error: "Demande manquante." }); return; }
      let r; try { r = await at("GET", T("Support") + "/" + b.id); } catch (e) { res.status(404).json({ error: "Demande introuvable." }); return; }
      const fields = {};
      if (b.statut !== undefined) { if (!STATUTS.includes(b.statut)) { res.status(400).json({ error: "Statut inconnu." }); return; } fields["Statut"] = b.statut; }
      const reponse = b.reponse !== undefined ? String(b.reponse || "").trim().slice(0, 4000) : null;
      if (reponse) { fields["Réponse"] = reponse; fields["Répondu par"] = [sess.uid]; fields["Répondu le"] = new Date().toISOString(); if (!fields["Statut"] && fv(r, "Statut") === "Nouveau") fields["Statut"] = "En cours"; }
      if (!Object.keys(fields).length) { res.status(400).json({ error: "Rien à enregistrer." }); return; }
      await at("PATCH", T("Support"), { records: [{ id: r.id, fields }], typecast: true });
      await logAction(sess, "Support : " + (reponse ? "réponse" : "statut"), "Support", r.id, (fields["Statut"] || "") + (reponse ? " · " + reponse.slice(0, 80) : ""));
      // Prévenir l'auteur si on lui répond ou si c'est résolu.
      const authorId = (fv(r, "Auteur") || [])[0];
      let notified = false;
      if (authorId && authorId !== sess.uid && (reponse || fields["Statut"] === "Résolu")) {
        const author = await at("GET", T("Utilisateurs") + "/" + authorId);
        const st = fields["Statut"] || fv(r, "Statut");
        await notifyUsers([author], {
          title: st === "Résolu" ? "✅ Ta demande est résolue" : "💬 Réponse à ta demande", body: reponse ? reponse.replace(/\s+/g, " ").slice(0, 160) : "Ta demande « " + String(fv(r, "Texte") || "").slice(0, 60) + " » est marquée résolue.", url: "/?aide=demandes",
          mail: { wanted: true, subject: "VHB Team · " + (st === "Résolu" ? "Demande résolue" : "Réponse à ta demande"), title: st === "Résolu" ? "Ta demande est résolue" : "Réponse à ta demande", html: '<p style="color:#555">Ta demande : « ' + esc(String(fv(r, "Texte") || "").slice(0, 200)) + " »</p>" + (reponse ? '<div style="white-space:pre-wrap;font-size:15px;line-height:1.55">' + esc(reponse) + "</div>" : ""), cta: { url: appUrl(req) + "/?aide=demandes", label: "Voir mes demandes" } },
        });
        notified = true;
      }
      res.status(200).json({ ok: true, notified });
      return;
    }
    res.status(400).json({ error: "Action inconnue : " + b.action });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
