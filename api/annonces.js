// Annonces : un émetteur → un groupe (staff d'une équipe, tous les coachs, le CA, tout le club) ou une personne.
// POST { action, ... } — session obligatoire.
//   targets                                   → groupes autorisés pour moi + personnes
//   send   { target: { kind, id? }, titre, texte, accuse, mail } — droit « Envoyer des annonces »
//          (« tout le club » : droit « Écrire à tout le club »)
//   list                                      → reçues (avec lu / bien reçu) et envoyées (compteurs de lecture)
//   read   { id }  /  ack { id }              → marquer lu / « Bien reçu »
//   fils / fil / poster / effacer            → discussions (voir _discussions.js)
import { at, getSession, can, canAny, seesTeam, readBody, logAction, appUrl } from "./_lib.js";
import { notifyUsers, rightsOf, hasRight, esc } from "./_notify.js";
import { discussions } from "./_discussions.js";

const T = (n) => encodeURIComponent(n);
const fv = (r, k) => ((r && r.fields) || {})[k];
const isId = (x) => typeof x === "string" && /^[A-Za-z0-9]{2,24}$/.test(x);
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
async function byIds(table, ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 40) out.push(...await listAll(table, "OR(" + ids.slice(i, i + 40).map((id) => "RECORD_ID()='" + id + "'").join(",") + ")"));
  return out;
}

// Groupes autorisés et destinataires correspondants.
async function buildTargets(sess) {
  const [users, teams, staff, roles] = await Promise.all([listAll(T("Utilisateurs")), listAll(T("Équipes")), listAll(T("Staff")), listAll(T("Rôles"))]);
  const active = users.filter((u) => fv(u, "Actif") !== false && fv(u, "Email"));
  const groups = [];
  const msg = can(sess, "msg"), all = can(sess, "msgall");
  if (msg || all) {
    const visible = teams.filter((t) => !fv(t, "Archivée") && (all || seesTeam(sess, t.id))).sort((a, b) => (fv(a, "Ordre") || 99) - (fv(b, "Ordre") || 99));
    const staffOf = (tid) => [...new Set(staff.filter((s) => (fv(s, "Équipe") || []).includes(tid)).flatMap((s) => fv(s, "Personne") || []))];
    const coachs = [...new Set(visible.flatMap((t) => staffOf(t.id)))];
    if (coachs.length) groups.push({ kind: "coachs", label: all || sess.scope === "all" ? "Tous les coachs et staffs" : "Les staffs de mes équipes", ids: coachs });
    visible.forEach((t) => { const ids = staffOf(t.id); if (ids.length) groups.push({ kind: "team", id: t.id, label: "Staff · " + (fv(t, "Nom") || "Équipe"), ids }); });
    if (all || can(sess, "ca")) {
      const ca = active.filter((u) => hasRight(rightsOf(u, roles), "ca")).map((u) => u.id);
      if (ca.length) groups.push({ kind: "ca", label: "Le Conseil d'administration", ids: ca });
    }
    if (all) groups.push({ kind: "club", label: "Tout le club (tous les comptes actifs)", ids: active.map((u) => u.id) });
  }
  const people = active.map((u) => ({ id: u.id, nom: nameOf(u) })).sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  return { groups, people, users: active };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.status(405).json({ error: "POST uniquement" }); return; }
  const sess = await getSession(req, res);
  if (!sess) { res.status(401).json({ error: "Session expirée : reconnecte-toi.", code: "auth" }); return; }
  const b = readBody(req);
  try {
    if (["fils", "fil", "poster", "effacer"].includes(b.action)) { await discussions(sess, b, res); return; }
    // Pastilles des espaces : ce qui attend dans Sportif (séances en retard) et Admin (demandes de support nouvelles).
    if (b.action === "compteurs") {
      const out = { sport: 0, admin: 0 };
      const today = new Date(Date.now() + 3600e3).toISOString().slice(0, 10);
      const since = new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10);
      if (["point", "eff", "plan", "corr", "valid"].some((r) => can(sess, r))) {
        const q = new URLSearchParams({ pageSize: "100", filterByFormula: "AND(IS_AFTER({Date}, '" + since + "'), IS_BEFORE({Date}, '" + today + "'), {Statut}!='Pointée', {Statut}!='Annulée')" });
        q.append("fields[]", "Équipe"); q.append("fields[]", "Statut"); q.append("fields[]", "Date");
        const j = await at("GET", T("Séances") + "?" + q.toString());
        out.sport = (j.records || []).filter((s) => ((s.fields || {})["Équipe"] || []).some((t) => seesTeam(sess, t))).length;
      }
      if (can(sess, "support")) {
        const q = new URLSearchParams({ pageSize: "100", filterByFormula: "{Statut}='Nouveau'" }); q.append("fields[]", "Statut");
        try { const j = await at("GET", T("Support") + "?" + q.toString()); out.admin = (j.records || []).length; } catch (e) {}
      }
      res.status(200).json(out); return;
    }
    if (b.action === "targets") {
      if (!canAny(sess, ["msg", "msgall"])) { res.status(403).json({ error: "Tu n'as pas le droit d'envoyer des annonces." }); return; }
      const { groups, people } = await buildTargets(sess);
      res.status(200).json({ groups: groups.map((g) => ({ kind: g.kind, id: g.id || null, label: g.label, n: g.ids.filter((x) => x !== sess.uid).length })), people: people.filter((p) => p.id !== sess.uid) });
      return;
    }

    if (b.action === "send") {
      if (!canAny(sess, ["msg", "msgall"])) { res.status(403).json({ error: "Tu n'as pas le droit d'envoyer des annonces." }); return; }
      const titre = String(b.titre || "").trim().slice(0, 120), texte = String(b.texte || "").trim().slice(0, 4000);
      if (!titre || !texte) { res.status(400).json({ error: "Le titre et le message sont obligatoires." }); return; }
      const tg = b.target || {};
      const { groups, users } = await buildTargets(sess);
      let ids = [], label = "";
      if (tg.kind === "person") {
        if (!isId(tg.id) || !users.some((u) => u.id === tg.id)) { res.status(400).json({ error: "Destinataire introuvable." }); return; }
        ids = [tg.id]; label = nameOf(users.find((u) => u.id === tg.id));
      } else {
        const g = groups.find((x) => x.kind === tg.kind && (x.id || null) === (tg.id || null));
        if (!g) { res.status(403).json({ error: "Tu ne peux pas écrire à ce groupe." }); return; }
        ids = g.ids.filter((x) => x !== sess.uid); label = g.label;
      }
      if (!ids.length) { res.status(400).json({ error: "Personne à prévenir dans ce groupe." }); return; }
      const now = new Date().toISOString();
      const rec = (await at("POST", T("Annonces"), { records: [{ fields: { "Titre": titre, "Texte": texte, "Auteur": [sess.uid], "Date": now, "Cible": label, "Destinataires": ids, "Accusé demandé": !!b.accuse, "Copie mail": !!b.mail } }], typecast: true })).records[0];
      const me = users.find((u) => u.id === sess.uid);
      const url = appUrl(req) + "/?annonce=" + rec.id;
      const html = '<p style="color:#555;margin:0 0 10px">De <b>' + esc(nameOf(me)) + "</b> · " + esc(label) + "</p>"
        + '<div style="white-space:pre-wrap;font-size:15px;line-height:1.55;color:#16171B">' + esc(texte) + "</div>"
        + (b.accuse ? '<p style="color:#555;margin-top:14px">Merci de confirmer « Bien reçu » dans l\'appli.</p>' : "");
      const r = await notifyUsers(users.filter((u) => ids.includes(u.id)), {
        title: "📣 " + titre, body: nameOf(me) + " : " + texte.replace(/\s+/g, " ").slice(0, 140), url: "/?annonce=" + rec.id,
        mail: { wanted: !!b.mail, subject: "VHB Team · " + titre, title: titre, html, cta: { url, label: b.accuse ? "Ouvrir et confirmer" : "Ouvrir dans VHB Team" } },
      });
      await logAction(sess, "Annonce", "Annonces", rec.id, label + " · " + ids.length + " destinataire(s) · " + titre);
      res.status(200).json({ ok: true, id: rec.id, destinataires: ids.length, ...r });
      return;
    }

    const me = await at("GET", T("Utilisateurs") + "/" + sess.uid);
    if (b.action === "list") {
      const recIds = fv(me, "Annonces reçues") || [], sentIds = fv(me, "Annonces écrites") || [];
      const [rec, sent] = await Promise.all([recIds.length ? byIds(T("Annonces"), recIds.slice(-200)) : [], sentIds.length ? byIds(T("Annonces"), sentIds.slice(-100)) : []]);
      const authorIds = [...new Set(rec.flatMap((a) => fv(a, "Auteur") || []).concat(sent.flatMap((a) => fv(a, "Destinataires") || [])))];
      const people = authorIds.length ? await byIds(T("Utilisateurs"), authorIds) : [];
      const nm = (id) => { const u = people.find((x) => x.id === id); return u ? nameOf(u) : "Membre"; };
      const sortD = (a, c) => String(fv(c, "Date")).localeCompare(String(fv(a, "Date")));
      res.status(200).json({
        received: rec.sort(sortD).map((a) => ({ id: a.id, titre: fv(a, "Titre"), texte: fv(a, "Texte"), date: fv(a, "Date"), cible: fv(a, "Cible"), auteur: nm((fv(a, "Auteur") || [])[0]), accuse: !!fv(a, "Accusé demandé"), lu: (fv(a, "Lu par") || []).includes(sess.uid), recu: (fv(a, "Reçu par") || []).includes(sess.uid) })),
        sent: sent.sort(sortD).map((a) => { const d = fv(a, "Destinataires") || [], lu = fv(a, "Lu par") || [], ok = fv(a, "Reçu par") || []; return { id: a.id, titre: fv(a, "Titre"), texte: fv(a, "Texte"), date: fv(a, "Date"), cible: fv(a, "Cible"), accuse: !!fv(a, "Accusé demandé"), total: d.length, lus: d.filter((x) => lu.includes(x)).length, recus: d.filter((x) => ok.includes(x)).length, nonLus: d.filter((x) => !lu.includes(x)).map(nm), nonRecus: fv(a, "Accusé demandé") ? d.filter((x) => !ok.includes(x)).map(nm) : [] }; }),
      });
      return;
    }
    if (b.action === "read" || b.action === "ack") {
      if (!isId(b.id)) { res.status(400).json({ error: "Annonce manquante." }); return; }
      let a; try { a = await at("GET", T("Annonces") + "/" + b.id); } catch (e) { res.status(404).json({ error: "Annonce introuvable." }); return; }
      if (!(fv(a, "Destinataires") || []).includes(sess.uid)) { res.status(403).json({ error: "Cette annonce ne t'est pas adressée." }); return; }
      const lu = fv(a, "Lu par") || [], ok = fv(a, "Reçu par") || [];
      const fields = {};
      if (!lu.includes(sess.uid)) fields["Lu par"] = lu.concat([sess.uid]);
      if (b.action === "ack" && !ok.includes(sess.uid)) fields["Reçu par"] = ok.concat([sess.uid]);
      if (Object.keys(fields).length) await at("PATCH", T("Annonces"), { records: [{ id: a.id, fields }] });
      res.status(200).json({ ok: true });
      return;
    }
    res.status(400).json({ error: "Action inconnue : " + b.action });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
