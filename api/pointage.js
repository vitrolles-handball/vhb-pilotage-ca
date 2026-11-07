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
      res.status(200).json({ ok: true, skipped: true, reason: "Séance déjà pointée plus récemment par un autre membre du staff." });
      return;
    }
    const presents = [...new Set((b.presents || []).filter((x) => typeof x === "string" && x.startsWith("rec")))];
    if (presents.length > 80) { res.status(400).json({ error: "Trop de joueurs." }); return; }
    const now = new Date().toISOString();
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
    if (wasPointed) await logAction(sess, "Pointage modifié", "Séances", seanceId, presents.length + " présent(s)" + (by && by !== sess.uid ? " — remplace le pointage d'un autre membre" : ""));
    res.status(200).json({ ok: true, presents: presents.length, result: upd["Résultat"] || null, replaced: wasPointed && by && by !== sess.uid ? by : null });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
