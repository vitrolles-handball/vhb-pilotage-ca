// Pointage d'une séance (entraînement, match, séance supplémentaire, stage).
// POST { action, ... } — session obligatoire, droit « Pointer les séances » sur l'équipe :
//   save   { seanceId, presents: [joueurIds], excuses?: [{ joueurId, motif }], score?: { vhb, adv }, capturedAt? }
//          → remplace les pointages de la séance, la passe « Pointée », calcule le résultat d'un match.
//          capturedAt (envoi différé hors ligne) : si quelqu'un a pointé APRÈS, on ne l'écrase pas.
//   cancel { seanceId, motif }   → séance annulée (sort du calcul des primes)
//   reopen { seanceId }          → annule l'annulation (repasse « Prévue »)
//   addPlayer { seanceId, joueurId? | prenom+nom } → ajoute un joueur à l'équipe de la séance,
//          en Renfort « À valider » (un responsable le passera en Effectif ou le gardera en renfort).
import { at, ENFORCE, getSession, can, canAny, seesTeam, readBody, logAction } from "./_lib.js";

const T_S = encodeURIComponent("Séances");
const T_P = encodeURIComponent("Pointages");

async function deleteMany(table, ids) {
  for (let i = 0; i < ids.length; i += 10) {
    const q = ids.slice(i, i + 10).map((id) => "records[]=" + encodeURIComponent(id)).join("&");
    await at("DELETE", table + "?" + q);
  }
}
async function createMany(table, records) {
  const out = [];
  for (let i = 0; i < records.length; i += 10) {
    const j = await at("POST", table, { records: records.slice(i, i + 10), typecast: true });
    out.push(...(j.records || []));
  }
  return out;
}

async function getByIds(table, ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 40) {
    const q = new URLSearchParams({ pageSize: "100", filterByFormula: "OR(" + ids.slice(i, i + 40).map((id) => "RECORD_ID()='" + id + "'").join(",") + ")" });
    const j = await at("GET", table + "?" + q.toString()); out.push(...(j.records || []));
  }
  return out;
}
const hm = (iso) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
const dm = (iso) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" });
async function userName(id) { try { const u = await at("GET", encodeURIComponent("Utilisateurs") + "/" + id); return (((u.fields || {})["Prénom"] || "") + " " + ((u.fields || {})["Nom"] || "")).trim() || "un autre membre"; } catch (e) { return "un autre membre"; } }

const MOIS_L = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
async function monthLock(team, month) {
  if (!team || !/^\d{4}-\d{2}$/.test(month)) return null;
  const q = new URLSearchParams({ filterByFormula: "AND({Mois}='" + month + "', {Statut}='Validé')" });
  const j = await at("GET", encodeURIComponent("Primes – Mois") + "?" + q.toString());
  const m = (j.records || []).find((r) => ((r.fields || {})["Équipe"] || []).includes(team));
  if (!m) return null;
  const by = ((m.fields || {})["Validé par"] || [])[0];
  return { at: (m.fields || {})["Validé le"] || null, by: by ? await userName(by) : null, label: MOIS_L[Number(month.slice(5)) - 1] + " " + month.slice(0, 4) };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.status(405).json({ error: "POST uniquement" }); return; }
  const sess = await getSession(req, res);
  if (!sess) { res.status(401).json({ error: "Session expirée : reconnecte-toi.", code: "auth" }); return; }
  const b = readBody(req);
  const { action, seanceId } = b;
  if (!seanceId) { res.status(400).json({ error: "Séance manquante." }); return; }
  try {
    let s;
    try { s = await at("GET", T_S + "/" + encodeURIComponent(seanceId)); } catch (e) { res.status(404).json({ error: "Séance introuvable." }); return; }
    const fl = s.fields || {};
    const team = (fl["Équipe"] || [])[0];
    const okRight = action === "save" ? can(sess, "point") : canAny(sess, ["point", "plan", "eff"]);
    if (!okRight || !seesTeam(sess, team)) { res.status(403).json({ error: "Tu ne peux pas pointer les séances de cette équipe." }); return; }

    // Mois de primes validé : la séance est verrouillée (correction = régularisation dans Primes).
    const lock = await monthLock(team, String(fl["Date"] || "").slice(0, 7));
    if (action === "etat") { res.status(200).json({ locked: !!lock, validatedAt: lock ? lock.at : null, validatedBy: lock ? lock.by : null }); return; }
    if (lock) { res.status(409).json({ error: "Le mois de primes de " + lock.label + " est validé" + (lock.at ? " depuis le " + dm(lock.at) : "") + " : cette séance ne peut plus être modifiée. Pour corriger un montant, passe par une régularisation (Primes).", code: "locked" }); return; }

    if (action === "cancel") {
      const motif = String(b.motif || "").slice(0, 120) || "Non précisé";
      // Version précédente du pointage, gardée au journal.
    const oldPts = fl["Statut"] === "Pointée" && (fl["Pointages"] || []).length ? await getByIds(T_P, fl["Pointages"]) : [];
    if (fl["Pointages"] && fl["Pointages"].length) await deleteMany(T_P, fl["Pointages"]);
      await at("PATCH", T_S, { records: [{ id: seanceId, fields: { "Statut": "Annulée", "Motif annulation": motif, "Pointée par": [sess.uid], "Pointée le": new Date().toISOString() } }], typecast: true });
      await logAction(sess, "Annulation", "Séances", seanceId, motif);
      res.status(200).json({ ok: true });
      return;
    }
    if (action === "reopen") {
      await at("PATCH", T_S, { records: [{ id: seanceId, fields: { "Statut": "Prévue", "Motif annulation": "" } }], typecast: true });
      await logAction(sess, "Séance rétablie", "Séances", seanceId, "");
      res.status(200).json({ ok: true });
      return;
    }
    if (action === "addPlayer") {
      if (!canAny(sess, ["point", "eff"])) { res.status(403).json({ error: "Tu ne peux pas ajouter de joueur à cette équipe." }); return; }
      const date = String(fl["Date"] || "").slice(0, 10);
      const T_J = encodeURIComponent("Joueurs"), T_E = encodeURIComponent("Effectifs");
      let pid = typeof b.joueurId === "string" && /^rec[A-Za-z0-9]{14}$/.test(b.joueurId) ? b.joueurId : null;
      let label;
      if (pid) {
        let pl; try { pl = await at("GET", T_J + "/" + pid); } catch (e) { res.status(404).json({ error: "Joueur introuvable." }); return; }
        label = (((pl.fields || {})["Prénom"] || "") + " " + ((pl.fields || {})["Nom"] || "")).trim();
        // Déjà dans l'équipe à cette date ? On ne crée pas de doublon.
        const effIds = (pl.fields || {})["Effectifs"] || [];
        const mine = effIds.length ? (await getByIds(T_E, effIds)).filter((e) => ((e.fields || {})["Équipe"] || []).includes(team)) : [];
        const open = mine.find((e) => { const x = e.fields || {}; return (!x["Entrée"] || x["Entrée"] <= date) && (!x["Sortie"] || x["Sortie"] >= date); });
        if (open) { res.status(200).json({ ok: true, joueurId: pid, effectifId: open.id, already: true, statut: (open.fields || {})["Statut"] || "Effectif" }); return; }
      } else {
        const prenom = String(b.prenom || "").trim().slice(0, 60), nom = String(b.nom || "").trim().slice(0, 60);
        if (!prenom || !nom) { res.status(400).json({ error: "Indique le prénom et le nom du joueur." }); return; }
        const [j] = await createMany(T_J, [{ fields: { "Prénom": prenom, "Nom": nom } }]);
        pid = j.id; label = prenom + " " + nom;
      }
      let teamName = ""; try { teamName = ((await at("GET", encodeURIComponent("Équipes") + "/" + team)).fields || {})["Nom"] || ""; } catch (e) {}
      const [ef] = await createMany(T_E, [{ fields: { "Libellé": label + " — " + teamName, "Joueur": [pid], "Équipe": [team], "Statut": "Renfort", "Entrée": date || null, "À valider": true } }]);
      await logAction(sess, "Joueur ajouté depuis une séance (renfort à valider)", "Effectifs", ef.id, label + " · " + teamName + " · séance du " + date);
      res.status(200).json({ ok: true, joueurId: pid, effectifId: ef.id, statut: "Renfort" });
      return;
    }
    if (action !== "save") { res.status(400).json({ error: "Action inconnue : " + action }); return; }

    // Envoi différé : quelqu'un a-t-il pointé cette séance après la saisie hors ligne ?
    const captured = b.capturedAt ? Date.parse(b.capturedAt) : Date.now();
    const already = fl["Pointée le"] ? Date.parse(fl["Pointée le"]) : 0;
    const by = (fl["Pointée par"] || [])[0];
    if (fl["Statut"] === "Pointée" && already > captured && by && by !== sess.uid) {
      res.status(200).json({ ok: true, skipped: true, reason: "Séance déjà pointée plus récemment par " + (await userName(by)) + " (le " + dm(fl["Pointée le"]) + " à " + hm(fl["Pointée le"]) + ") : ta saisie hors ligne n'a pas été appliquée." });
      return;
    }
    const presents = [...new Set((b.presents || []).filter((x) => typeof x === "string" && x.startsWith("rec")))];
    if (presents.length > 80) { res.status(400).json({ error: "Trop de joueurs." }); return; }
    const now = new Date().toISOString();
    // Version précédente du pointage, gardée au journal.
    const oldPts = fl["Statut"] === "Pointée" && (fl["Pointages"] || []).length ? await getByIds(T_P, fl["Pointages"]) : [];
    if (fl["Pointages"] && fl["Pointages"].length) await deleteMany(T_P, fl["Pointages"]);
    if (presents.length) await createMany(T_P, presents.map((pid) => ({ fields: { "Libellé": (fl["Libellé"] || "Séance") + " · présent", "Séance": [seanceId], "Joueur": [pid], "État": "Présent", "Saisi par": [sess.uid], "Saisi le": now } })));
    // Absences excusées (avec motif) : une ligne « Excusé » par joueur, jamais pour un joueur noté présent.
    const excuses = (Array.isArray(b.excuses) ? b.excuses : []).filter((x) => x && typeof x.joueurId === "string" && x.joueurId.startsWith("rec") && !presents.includes(x.joueurId)).slice(0, 80);
    const seenX = new Set();
    const exList = excuses.filter((x) => !seenX.has(x.joueurId) && seenX.add(x.joueurId)).map((x) => ({ fields: { "Libellé": (fl["Libellé"] || "Séance") + " · excusé", "Séance": [seanceId], "Joueur": [x.joueurId], "État": "Excusé", "Motif": String(x.motif || "").trim().slice(0, 120) || "Non précisé", "Saisi par": [sess.uid], "Saisi le": now } }));
    if (exList.length) await createMany(T_P, exList);
    const upd = { "Statut": "Pointée", "Motif annulation": "", "Pointée par": [sess.uid], "Pointée le": now };
    if (fl["Type"] === "Match" && b.score && b.score.vhb !== undefined && b.score.adv !== undefined && b.score.vhb !== "" && b.score.adv !== "") {
      const v = Number(b.score.vhb), a = Number(b.score.adv);
      upd["Score VHB"] = v; upd["Score adverse"] = a;
      upd["Résultat"] = v > a ? "Victoire" : v === a ? "Nul" : "Défaite";
    }
    await at("PATCH", T_S, { records: [{ id: seanceId, fields: upd }], typecast: true });
    const wasPointed = fl["Statut"] === "Pointée";
    if (wasPointed) {
      const before = oldPts.filter((p) => (p.fields || {})["État"] !== "Excusé").map((p) => ((p.fields || {})["Joueur"] || [])[0]).filter(Boolean);
      const exBefore = oldPts.filter((p) => (p.fields || {})["État"] === "Excusé").map((p) => ((p.fields || {})["Joueur"] || [])[0] + " (" + ((p.fields || {})["Motif"] || "") + ")");
      const detail = { "Présents": { avant: before, après: presents }, "Excusés": { avant: exBefore, après: exList.map((x) => x.fields["Joueur"][0] + " (" + x.fields["Motif"] + ")") }, "Pointée par": { avant: by ? [by] : [], après: [sess.uid] }, "Pointée le": { avant: fl["Pointée le"] || null, après: now } };
      if (fl["Type"] === "Match" && upd["Score VHB"] !== undefined) detail["Score"] = { avant: fl["Score VHB"] != null ? fl["Score VHB"] + "-" + fl["Score adverse"] : null, après: upd["Score VHB"] + "-" + upd["Score adverse"] };
      await logAction(sess, by && by !== sess.uid ? "Pointage remplacé (autre membre)" : "Pointage modifié", "Séances", seanceId, detail);
    }
    res.status(200).json({ ok: true, presents: presents.length, result: upd["Résultat"] || null, replaced: wasPointed && by && by !== sess.uid ? by : null });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
