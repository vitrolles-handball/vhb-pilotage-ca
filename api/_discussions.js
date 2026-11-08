// Discussions (appelées par /api/annonces) : réponses sous une annonce et fil du staff de chaque équipe.
// Pas de temps réel : l'appli recharge le fil ouvert toutes les quelques secondes.
//   fils                     → mes fils (équipes visibles + annonces avec messages), dernier message, non lus
//   fil      { fil }         → messages du fil (200 derniers) ; marque le fil comme lu
//   poster   { fil, texte }  → nouveau message ; notifie les autres participants (cloche + téléphone, pas de mail)
//   effacer  { id }          → retire un de ses propres messages
// fil = "annonce:<id>" (auteur + destinataires de l'annonce) ou "equipe:<id>" (staff de l'équipe,
//       + les personnes qui voient toutes les équipes avec un droit sportif).
import { at, can, canAny, seesTeam, logAction } from "./_lib.js";
import { notifyUsers } from "./_notify.js";

const T = (n) => encodeURIComponent(n);
const fv = (r, k) => ((r && r.fields) || {})[k];
const isId = (x) => typeof x === "string" && /^[A-Za-z0-9]{2,24}$/.test(x);
const nameOf = (u) => (((fv(u, "Prénom") || "") + " " + (fv(u, "Nom") || "")).trim() || fv(u, "Email") || "Membre");
const SPORT = ["point", "eff", "plan", "corr", "valid"];
const parseFil = (s) => { const m = String(s || "").match(/^(annonce|equipe):([A-Za-z0-9]{2,24})$/); return m ? { kind: m[1], id: m[2], key: m[1] + ":" + m[2] } : null; };
const esc = (s) => String(s).replace(/'/g, "\\'");

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
const readMap = (me) => { try { const o = JSON.parse(fv(me, "Discussions lues") || "{}"); return o && typeof o === "object" ? o : {}; } catch (e) { return {}; } };
async function markRead(me, key) {
  const m = readMap(me); m[key] = new Date().toISOString();
  // On ne garde que les 150 fils les plus récents.
  const keep = Object.fromEntries(Object.entries(m).sort((a, b) => String(b[1]).localeCompare(String(a[1]))).slice(0, 150));
  await at("PATCH", T("Utilisateurs") + "/" + me.id, { fields: { "Discussions lues": JSON.stringify(keep) } });
}

// Participants d'un fil, ou null si je n'y ai pas accès.
async function access(sess, fil) {
  if (fil.kind === "annonce") {
    let a; try { a = await at("GET", T("Annonces") + "/" + fil.id); } catch (e) { return null; }
    const ids = [...new Set((fv(a, "Auteur") || []).concat(fv(a, "Destinataires") || []))];
    if (!ids.includes(sess.uid)) return null;
    return { titre: fv(a, "Titre") || "Annonce", sous: "Réponses à l'annonce", ids };
  }
  let t; try { t = await at("GET", T("Équipes") + "/" + fil.id); } catch (e) { return null; }
  if (fv(t, "Archivée")) return null;
  const staff = (await listAll(T("Staff"))).filter((s) => (fv(s, "Équipe") || []).includes(t.id));
  const ids = [...new Set(staff.flatMap((s) => fv(s, "Personne") || []))];
  const ok = ids.includes(sess.uid) || (seesTeam(sess, t.id) && canAny(sess, SPORT));
  if (!ok) return null;
  return { titre: "Staff · " + (fv(t, "Nom") || "Équipe"), sous: "Discussion du staff de l'équipe", ids, team: t };
}

export async function discussions(sess, b, res) {
  const me = await at("GET", T("Utilisateurs") + "/" + sess.uid);

  if (b.action === "fils") {
    const read = readMap(me);
    const since = new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10);
    const [teams, staff, msgs] = await Promise.all([listAll(T("Équipes")), listAll(T("Staff")), listAll(T("Messages"), "IS_AFTER({Date}, '" + since + "')")]);
    const myTeams = new Set(staff.filter((s) => (fv(s, "Personne") || []).includes(sess.uid)).flatMap((s) => fv(s, "Équipe") || []));
    const vis = teams.filter((t) => !fv(t, "Archivée") && (myTeams.has(t.id) || (seesTeam(sess, t.id) && canAny(sess, SPORT))))
      .sort((a, c) => (fv(a, "Ordre") || 99) - (fv(c, "Ordre") || 99));
    const annIds = [...new Set((fv(me, "Annonces reçues") || []).concat(fv(me, "Annonces écrites") || []))];
    const byFil = new Map();
    msgs.forEach((m) => { const k = fv(m, "Fil"); if (!byFil.has(k)) byFil.set(k, []); byFil.get(k).push(m); });
    const authors = [...new Set(msgs.flatMap((m) => fv(m, "Auteur") || []))];
    const people = authors.length ? await byIds(T("Utilisateurs"), authors) : [];
    const nm = (id) => { const u = people.find((x) => x.id === id); return u ? nameOf(u) : "Membre"; };
    const summary = (key) => {
      const list = (byFil.get(key) || []).sort((a, c) => String(fv(a, "Date")).localeCompare(String(fv(c, "Date"))));
      const last = list[list.length - 1];
      const unread = list.filter((m) => !(fv(m, "Auteur") || []).includes(sess.uid) && String(fv(m, "Date")) > String(read[key] || "")).length;
      return { n: list.length, unread, last: last ? { texte: String(fv(last, "Texte") || "").slice(0, 120), auteur: nm((fv(last, "Auteur") || [])[0]), date: fv(last, "Date"), moi: (fv(last, "Auteur") || []).includes(sess.uid) } : null };
    };
    const out = vis.map((t) => ({ fil: "equipe:" + t.id, titre: "Staff · " + (fv(t, "Nom") || "Équipe"), type: "equipe", ...summary("equipe:" + t.id) }));
    const annKeys = [...byFil.keys()].filter((k) => k.startsWith("annonce:") && annIds.includes(k.slice(8)));
    const anns = annKeys.length ? await byIds(T("Annonces"), annKeys.map((k) => k.slice(8))) : [];
    anns.forEach((a) => out.push({ fil: "annonce:" + a.id, titre: fv(a, "Titre") || "Annonce", type: "annonce", ...summary("annonce:" + a.id) }));
    out.sort((a, c) => String((c.last && c.last.date) || "").localeCompare(String((a.last && a.last.date) || "")));
    res.status(200).json({ fils: out, unread: out.reduce((s, x) => s + x.unread, 0) });
    return;
  }

  if (b.action === "effacer") {
    if (!isId(b.id)) { res.status(400).json({ error: "Message manquant." }); return; }
    let m; try { m = await at("GET", T("Messages") + "/" + b.id); } catch (e) { res.status(404).json({ error: "Message introuvable." }); return; }
    if (!(fv(m, "Auteur") || []).includes(sess.uid)) { res.status(403).json({ error: "Tu ne peux retirer que tes propres messages." }); return; }
    await at("DELETE", T("Messages") + "/" + m.id);
    res.status(200).json({ ok: true });
    return;
  }

  const fil = parseFil(b.fil);
  if (!fil) { res.status(400).json({ error: "Discussion inconnue." }); return; }
  const acc = await access(sess, fil);
  if (!acc) { res.status(403).json({ error: "Tu n'as pas accès à cette discussion." }); return; }

  if (b.action === "fil") {
    const msgs = (await listAll(T("Messages"), "{Fil}='" + esc(fil.key) + "'")).sort((a, c) => String(fv(a, "Date")).localeCompare(String(fv(c, "Date")))).slice(-200);
    const ids = [...new Set(msgs.flatMap((m) => fv(m, "Auteur") || []).concat(acc.ids))];
    const people = ids.length ? await byIds(T("Utilisateurs"), ids) : [];
    const nm = (id) => { const u = people.find((x) => x.id === id); return u ? nameOf(u) : "Membre"; };
    const lastD = msgs.length ? String(fv(msgs[msgs.length - 1], "Date")) : "";
    if (!readMap(me)[fil.key] || lastD > String(readMap(me)[fil.key])) await markRead(me, fil.key); // écrit seulement s'il y a du nouveau
    res.status(200).json({ fil: fil.key, titre: acc.titre, sous: acc.sous, participants: acc.ids.map(nm),
      messages: msgs.map((m) => ({ id: m.id, texte: fv(m, "Texte") || "", date: fv(m, "Date"), auteur: nm((fv(m, "Auteur") || [])[0]), moi: (fv(m, "Auteur") || []).includes(sess.uid) })) });
    return;
  }

  if (b.action === "poster") {
    const texte = String(b.texte || "").trim().slice(0, 2000);
    if (!texte) { res.status(400).json({ error: "Message vide." }); return; }
    const now = new Date().toISOString();
    const fields = { "Texte": texte, "Fil": fil.key, "Auteur": [sess.uid], "Date": now };
    if (fil.kind === "annonce") fields["Annonce"] = [fil.id]; else fields["Équipe"] = [fil.id];
    const rec = (await at("POST", T("Messages"), { records: [{ fields }], typecast: true })).records[0];
    await markRead(me, fil.key);
    // Prévenir les participants + ceux qui ont déjà écrit dans le fil (ex. un responsable hors staff).
    const earlier = await listAll(T("Messages"), "{Fil}='" + esc(fil.key) + "'");
    const target = [...new Set(acc.ids.concat(earlier.flatMap((m) => fv(m, "Auteur") || [])))].filter((id) => id !== sess.uid);
    const users = target.length ? (await byIds(T("Utilisateurs"), target)).filter((u) => fv(u, "Actif") !== false) : [];
    const r = users.length ? await notifyUsers(users, { title: "💬 " + acc.titre, body: nameOf(me) + " : " + texte.replace(/\s+/g, " ").slice(0, 140), url: "/?fil=" + fil.key }) : { push: 0 };
    res.status(200).json({ ok: true, id: rec.id, notified: users.length, ...r });
    return;
  }
  res.status(400).json({ error: "Action inconnue." });
}
