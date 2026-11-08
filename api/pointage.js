// Pointage d'une séance (entraînement, match, séance supplémentaire, stage).
// POST { action, ... } — session obligatoire, droit « Pointer les séances » sur l'équipe :
//   save   { seanceId, presents: [joueurIds], score?: { vhb, adv }, capturedAt? }
//          → remplace les pointages de la séance, la passe « Pointée », calcule le résultat d'un match.
//          capturedAt (envoi différé hors ligne) : si quelqu'un a pointé APRÈS, on ne l'écrase pas.
//   cancel { seanceId, motif }   → séance annulée (sort du calcul des primes)
//   reopen { seanceId }          → annule l'annulation (repasse « Prévue »)
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
    const okRight = action === "save" ? can(sess, "point") : canAny(sess, ["point", "plan"]);
    if (!okRight || !seesTeam(sess, team)) { res.status(403).json({ error: "Tu ne peux pas pointer les séances de cette équipe." }); return; }

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
      const detail = { "Présents": { avant: before, après: presents }, "Pointée par": { avant: by ? [by] : [], après: [sess.uid] }, "Pointée le": { avant: fl["Pointée le"] || null, après: now } };
      if (fl["Type"] === "Match" && upd["Score VHB"] !== undefined) detail["Score"] = { avant: fl["Score VHB"] != null ? fl["Score VHB"] + "-" + fl["Score adverse"] : null, après: upd["Score VHB"] + "-" + upd["Score adverse"] };
      await logAction(sess, by && by !== sess.uid ? "Pointage remplacé (autre membre)" : "Pointage modifié", "Séances", seanceId, detail);
    }
    res.status(200).json({ ok: true, presents: presents.length, result: upd["Résultat"] || null, replaced: wasPointed && by && by !== sess.uid ? by : null });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
