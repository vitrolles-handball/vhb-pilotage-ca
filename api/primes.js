// Primes de l'équipe fanion : calcul, validation, corrections, paiements.
// POST { action, ... } — session obligatoire, et l'équipe doit faire partie de celles de la personne.
//   month       { teamId, month }                      → calcul en direct (mois ouvert) ou lignes figées (mois validé)
//                                                         droits : Corriger, Valider, Comptabilité ou Paramétrer
//   excuse      { seanceId, joueurId, excused, motif }  → absence excusée / annulée — droit Corriger
//   extra       { teamId, joueurId, month, type, montant, motif } → prime exceptionnelle ou régularisation — Corriger
//   deleteExtra { lineId }                              → retire une ligne ajoutée (mois encore ouvert) — Corriger
//   validate    { teamId, month }                       → fige le mois (lignes recopiées, jamais recalculées) — Valider
//   pay         { lineIds, status, date, mode, ref }    → Mis en paiement / Payé / À payer — Comptabilité
import { at, getSession, can, canAny, seesTeam, readBody, logAction } from "./_lib.js";
import { computeMonth, round2, nextMonth } from "./_primes.js";

const T = (n) => encodeURIComponent(n);
const T_M = T("Primes – Mois"), T_L = T("Primes – Lignes");
const READ = ["corr", "valid", "compta", "param"];
const isMonth = (m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(m || ""));
const isRec = (x) => typeof x === "string" && /^[A-Za-z0-9]{2,24}$/.test(x); // identifiants Airtable (alphanumériques)
const esc = (s) => String(s).replace(/'/g, "\\'");
const todayParis = () => new Date(Date.now() + 3600e3).toISOString().slice(0, 10);

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
  for (let i = 0; i < ids.length; i += 40) {
    const chunk = ids.slice(i, i + 40);
    out.push(...await listAll(table, "OR(" + chunk.map((id) => "RECORD_ID()='" + id + "'").join(",") + ")"));
  }
  return out;
}
async function createMany(table, records) {
  const out = [];
  for (let i = 0; i < records.length; i += 10) out.push(...((await at("POST", table, { records: records.slice(i, i + 10), typecast: true })).records || []));
  return out;
}
async function patchMany(table, records) {
  for (let i = 0; i < records.length; i += 10) await at("PATCH", table, { records: records.slice(i, i + 10), typecast: true });
}
const prevDay = (m) => { const d = new Date(m + "-01T12:00:00Z"); d.setUTCDate(0); return d.toISOString().slice(0, 10); };

async function validatedMonth(teamId, month) {
  const rows = await listAll(T_M, "{Mois}='" + esc(month) + "'");
  return rows.find((r) => ((r.fields || {})["Équipe"] || []).includes(teamId) && (r.fields || {})["Statut"] === "Validé") || null;
}
async function loadAndCompute(team, month) {
  const seances = await listAll(T("Séances"), "AND(IS_AFTER({Date}, '" + prevDay(month) + "'), IS_BEFORE({Date}, '" + nextMonth(month) + "-01'))");
  const mine = seances.filter((s) => ((s.fields || {})["Équipe"] || []).includes(team.id));
  const pIds = [].concat(...mine.map((s) => (s.fields || {})["Pointages"] || []));
  const [pointages, effectifs, players, extrasAll] = await Promise.all([
    pIds.length ? byIds(T("Pointages"), pIds) : [],
    listAll(T("Effectifs")),
    listAll(T("Joueurs")),
    listAll(T_L, "AND({Période}='" + esc(month) + "', {Type}!='Normale')"),
  ]);
  const extras = extrasAll.filter((x) => ((x.fields || {})["Équipe"] || []).includes(team.id));
  return computeMonth({ team, month, seances: mine, pointages, effectifs, players, extras, today: todayParis() });
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.status(405).json({ error: "POST uniquement" }); return; }
  const sess = await getSession(req, res);
  if (!sess) { res.status(401).json({ error: "Session expirée : reconnecte-toi.", code: "auth" }); return; }
  const b = readBody(req);
  const deny = (msg) => res.status(403).json({ error: msg || "Tu n'as pas le droit de faire ça." });
  try {
    // ------------------------------------------------------------ Paiements (plusieurs équipes possibles)
    if (b.action === "pay") {
      if (!can(sess, "compta")) return deny("Réservé à la comptabilité.");
      const ids = [...new Set((b.lineIds || []).filter(isRec))];
      const status = ["À payer", "Mis en paiement", "Payé"].includes(b.status) ? b.status : null;
      if (!ids.length || !status) { res.status(400).json({ error: "Sélection ou statut manquant." }); return; }
      if (ids.length > 300) { res.status(400).json({ error: "Trop de lignes à la fois (300 au maximum)." }); return; }
      const lines = await byIds(T_L, ids);
      if (lines.length !== ids.length) { res.status(404).json({ error: "Certaines lignes sont introuvables." }); return; }
      for (const l of lines) {
        const fl = l.fields || {};
        if (!((fl["Équipe"] || []).every((t) => seesTeam(sess, t)))) return deny("Une des lignes concerne une équipe qui n'est pas la tienne.");
        if (!(fl["Mois"] || []).length) { res.status(409).json({ error: "Une des lignes appartient à un mois pas encore validé." }); return; }
      }
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date || "")) ? b.date : todayParis();
      const f = status === "Payé"
        ? { "Paiement": "Payé", "Payé le": date, "Mode": String(b.mode || "Virement").slice(0, 60), "Référence": String(b.ref || "").slice(0, 80) }
        : status === "Mis en paiement" ? { "Paiement": "Mis en paiement", "Payé le": null } : { "Paiement": "À payer", "Payé le": null, "Mode": "", "Référence": "" };
      await patchMany(T_L, ids.map((id) => ({ id, fields: f })));
      const total = round2(lines.reduce((t, l) => t + (Number((l.fields || {})["Montant"]) || 0), 0));
      await logAction(sess, "Paiement : " + status, "Primes – Lignes", ids.length > 5 ? ids.length + " lignes" : ids.join(", "), ids.length + " ligne(s), " + total.toFixed(2) + " €" + (status === "Payé" ? " · " + f["Mode"] + (f["Référence"] ? " · " + f["Référence"] : "") : ""));
      res.status(200).json({ ok: true, count: ids.length, total });
      return;
    }

    // ------------------------------------------------------------ Absence excusée (passe par la séance)
    if (b.action === "excuse") {
      if (!can(sess, "corr")) return deny("Réservé aux personnes qui corrigent les primes.");
      if (!isRec(b.seanceId) || !isRec(b.joueurId)) { res.status(400).json({ error: "Séance ou joueur manquant." }); return; }
      let s; try { s = await at("GET", T("Séances") + "/" + b.seanceId); } catch (e) { res.status(404).json({ error: "Séance introuvable." }); return; }
      const sf = s.fields || {}; const team = (sf["Équipe"] || [])[0];
      if (!seesTeam(sess, team)) return deny("Cette équipe ne fait pas partie des tiennes.");
      if (sf["Statut"] !== "Pointée") { res.status(409).json({ error: "La séance doit d'abord être pointée." }); return; }
      if (await validatedMonth(team, String(sf["Date"]).slice(0, 7))) { res.status(409).json({ error: "Ce mois est validé : passe par une régularisation." }); return; }
      const pts = (sf["Pointages"] || []).length ? await byIds(T("Pointages"), sf["Pointages"]) : [];
      const mine = pts.find((p) => ((p.fields || {})["Joueur"] || [])[0] === b.joueurId);
      const motif = String(b.motif || "").trim().slice(0, 120);
      if (b.excused) {
        if (!motif) { res.status(400).json({ error: "Indique le motif de l'absence." }); return; }
        if (mine && (mine.fields || {})["État"] === "Présent") { res.status(409).json({ error: "Ce joueur est noté présent à cette séance." }); return; }
        if (!mine) await createMany(T("Pointages"), [{ fields: { "Libellé": (sf["Libellé"] || "Séance") + " · excusé", "Séance": [s.id], "Joueur": [b.joueurId], "État": "Excusé", "Saisi par": [sess.uid], "Saisi le": new Date().toISOString() } }]);
        await logAction(sess, "Absence excusée", "Séances", s.id, "Joueur " + b.joueurId + " · " + motif);
      } else {
        if (mine && (mine.fields || {})["État"] === "Excusé") await at("DELETE", T("Pointages") + "/" + mine.id);
        await logAction(sess, "Excuse retirée", "Séances", s.id, "Joueur " + b.joueurId + (motif ? " · " + motif : ""));
      }
      res.status(200).json({ ok: true });
      return;
    }

    if (b.action === "deleteExtra") {
      if (!can(sess, "corr")) return deny("Réservé aux personnes qui corrigent les primes.");
      if (!isRec(b.lineId)) { res.status(400).json({ error: "Ligne manquante." }); return; }
      let l; try { l = await at("GET", T_L + "/" + b.lineId); } catch (e) { res.status(404).json({ error: "Ligne introuvable." }); return; }
      const fl = l.fields || {};
      if (fl["Type"] === "Normale") return deny("Une ligne normale ne se supprime pas.");
      if (!(fl["Équipe"] || []).every((t) => seesTeam(sess, t))) return deny("Cette équipe ne fait pas partie des tiennes.");
      if ((fl["Mois"] || []).length) { res.status(409).json({ error: "Ce mois est validé : la ligne ne peut plus être retirée. Ajoute une régularisation inverse." }); return; }
      await at("DELETE", T_L + "/" + l.id);
      await logAction(sess, "Prime retirée", "Primes – Lignes", l.id, (fl["Type"] || "") + " " + (fl["Montant"] || 0) + " € · " + (fl["Motif"] || ""));
      res.status(200).json({ ok: true });
      return;
    }

    // ------------------------------------------------------------ Actions sur une équipe et un mois
    const { teamId, month } = b;
    if (!isRec(teamId) || !isMonth(month)) { res.status(400).json({ error: "Équipe ou mois manquant." }); return; }
    if (!seesTeam(sess, teamId)) return deny("Cette équipe ne fait pas partie des tiennes.");
    let team; try { team = await at("GET", T("Équipes") + "/" + teamId); } catch (e) { res.status(404).json({ error: "Équipe introuvable." }); return; }
    const teamName = (team.fields || {})["Nom"] || "Équipe";

    if (b.action === "month") {
      if (!canAny(sess, READ)) return deny();
      const v = await validatedMonth(teamId, month);
      if (v) {
        const lines = await listAll(T_L, "{Période}='" + esc(month) + "'");
        const mine = lines.filter((l) => ((l.fields || {})["Mois"] || []).includes(v.id));
        let detail = {}; try { detail = JSON.parse((v.fields || {})["Détail"] || "{}"); } catch (e) {}
        res.status(200).json({ status: "Validé", mois: { id: v.id, validePar: ((v.fields || {})["Validé par"] || [])[0] || null, valideLe: (v.fields || {})["Validé le"] || null, total: (v.fields || {})["Total"] || 0 }, detail, lines: mine.map((l) => ({ id: l.id, ...l.fields })) });
        return;
      }
      const r = await loadAndCompute(team, month);
      res.status(200).json({ status: "Ouvert", ...r });
      return;
    }

    if (b.action === "extra") {
      if (!can(sess, "corr")) return deny("Réservé aux personnes qui corrigent les primes.");
      const type = b.type === "Régularisation" ? "Régularisation" : "Exceptionnelle";
      const montant = round2(Number(String(b.montant).replace(",", ".")));
      const motif = String(b.motif || "").trim().slice(0, 140);
      if (!isRec(b.joueurId)) { res.status(400).json({ error: "Choisis un joueur." }); return; }
      if (!montant || Math.abs(montant) > 2000) { res.status(400).json({ error: "Montant invalide." }); return; }
      if (type === "Exceptionnelle" && montant < 0) { res.status(400).json({ error: "Une prime exceptionnelle est positive : utilise une régularisation pour retirer un montant." }); return; }
      if (!motif) { res.status(400).json({ error: "Le motif est obligatoire." }); return; }
      if (await validatedMonth(teamId, month)) { res.status(409).json({ error: "Ce mois est déjà validé : choisis le mois suivant.", next: nextMonth(month) }); return; }
      const [l] = await createMany(T_L, [{ fields: { "Libellé": teamName + " · " + month + " · " + type, "Équipe": [teamId], "Période": month, "Joueur": [b.joueurId], "Type": type, "Montant": montant, "Motif": motif, "Paiement": "À payer", "Créé par": [sess.uid], "Créé le": new Date().toISOString() } }]);
      await logAction(sess, type === "Régularisation" ? "Régularisation" : "Prime exceptionnelle", "Primes – Lignes", l.id, teamName + " · " + month + " · " + montant.toFixed(2) + " € · " + motif);
      res.status(200).json({ ok: true, id: l.id });
      return;
    }

    if (b.action === "validate") {
      if (!can(sess, "valid")) return deny("Réservé aux personnes qui valident les primes.");
      if (await validatedMonth(teamId, month)) { res.status(409).json({ error: "Ce mois est déjà validé." }); return; }
      const r = await loadAndCompute(team, month);
      if (!r.canValidate) { res.status(409).json({ error: r.blockers.join(" ") || "Le mois ne peut pas encore être validé.", blockers: r.blockers }); return; }
      const now = new Date().toISOString();
      const detail = { bareme: r.bareme, counters: r.counters, seances: r.seances, totals: r.totals };
      const [m] = await createMany(T_M, [{ fields: { "Libellé": teamName + " · " + month, "Équipe": [teamId], "Mois": month, "Statut": "Validé", "Validé par": [sess.uid], "Validé le": now, "Séances comptées": r.counters.comptees, "Total": r.totals.total, "Détail": JSON.stringify(detail).slice(0, 90000) } }]);
      const normal = r.lines.filter((l) => l.seances || l.primePresence || l.primeVictoire).map((l) => ({ fields: {
        "Libellé": teamName + " · " + month + " · " + l.nom, "Équipe": [teamId], "Période": month, "Mois": [m.id], "Joueur": [l.joueur], "Type": "Normale",
        "Statut joueur": l.statut === "Renfort" ? "Renfort" : "Effectif", "Entraînements": l.entrainements, "Matchs": l.matchs, "Présences": l.presences, "Séances": l.seances,
        "Taux": Math.round(l.taux * 1000) / 1000, "Prime présence": l.primePresence, "Victoires": l.victoires, "Prime victoire": l.primeVictoire,
        "Montant": round2(l.primePresence + l.primeVictoire), "Paiement": "À payer", "Créé par": [sess.uid], "Créé le": now } }));
      await createMany(T_L, normal);
      const extraIds = [].concat(...r.lines.map((l) => l.extras.map((x) => x.id)));
      if (extraIds.length) await patchMany(T_L, extraIds.map((id) => ({ id, fields: { "Mois": [m.id] } })));
      await logAction(sess, "Mois validé", "Primes – Mois", m.id, teamName + " · " + month + " · " + r.totals.total.toFixed(2) + " € · " + normal.length + " joueurs");
      res.status(200).json({ ok: true, id: m.id, total: r.totals.total, lines: normal.length + extraIds.length });
      return;
    }

    res.status(400).json({ error: "Action inconnue : " + b.action });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
