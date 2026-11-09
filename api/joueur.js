// Fiche joueur et assiduité d'une équipe (toutes les équipes, avec ou sans primes).
// POST { action, ... } — session obligatoire ; la personne doit voir au moins une équipe du joueur.
//   fiche     { joueurId }          → équipes, assiduité par mois (vs moyenne de l'équipe), dernières séances,
//                                     primes (seulement avec un droit Primes : Corriger, Valider, Comptabilité, Paramétrer)
//   assiduite { teamId, month }     → présences / séances / taux du mois pour chaque joueur de l'équipe (sans montants)
//   saisonBilan / saisonArchive / saisonCloture → assistant de fin de saison (voir _saison.js)
// Droits : Gérer les effectifs, Pointer, Corriger, Valider ou Comptabilité (comme la lecture des joueurs).
import { at, getSession, canAny, seesTeam, readBody } from "./_lib.js";
import { computeMonth, counts, nextMonth, monthOf } from "./_primes.js";
import { saison } from "./_saison.js";

const T = (n) => encodeURIComponent(n);
const READ_PLAYERS = ["eff", "point", "corr", "valid", "compta"];
const READ_PRIMES = ["corr", "valid", "compta", "param"];
const isId = (x) => typeof x === "string" && /^[A-Za-z0-9]{2,24}$/.test(x);
const isMonth = (m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(m || ""));
const fv = (r, k) => ((r && r.fields) || {})[k];
const todayParis = () => new Date(Date.now() + 3600e3).toISOString().slice(0, 10);
// Saison : du 1er août au 31 juillet.
const seasonStart = (d) => { const y = Number(d.slice(0, 4)), m = Number(d.slice(5, 7)); return (m >= 8 ? y : y - 1) + "-08-01"; };

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
const inRange = (e, d) => (!fv(e, "Entrée") || fv(e, "Entrée") <= d) && (!fv(e, "Sortie") || fv(e, "Sortie") >= d);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.status(405).json({ error: "POST uniquement" }); return; }
  const sess = await getSession(req, res);
  if (!sess) { res.status(401).json({ error: "Session expirée : reconnecte-toi.", code: "auth" }); return; }
  if (!canAny(sess, READ_PLAYERS)) { res.status(403).json({ error: "Tu n'as pas accès aux fiches des joueurs." }); return; }
  const b = readBody(req);
  try {
    // Assistant de fin de saison (Admin › Équipes).
    if (String(b.action || "").startsWith("saison")) { await saison(sess, b, res); return; }
    // -------------------------------------------------------------- Assiduité d'une équipe sur un mois
    if (b.action === "assiduite") {
      if (!isId(b.teamId) || !isMonth(b.month)) { res.status(400).json({ error: "Équipe ou mois manquant." }); return; }
      if (!seesTeam(sess, b.teamId)) { res.status(403).json({ error: "Cette équipe ne fait pas partie des tiennes." }); return; }
      let team; try { team = await at("GET", T("Équipes") + "/" + b.teamId); } catch (e) { res.status(404).json({ error: "Équipe introuvable." }); return; }
      const prev = (() => { const d = new Date(b.month + "-01T12:00:00Z"); d.setUTCDate(0); return d.toISOString().slice(0, 10); })();
      const seances = (await listAll(T("Séances"), "AND(IS_AFTER({Date}, '" + prev + "'), IS_BEFORE({Date}, '" + nextMonth(b.month) + "-01'))")).filter((s) => (fv(s, "Équipe") || []).includes(b.teamId));
      const pIds = [].concat(...seances.map((s) => fv(s, "Pointages") || []));
      const [pointages, effectifs, players] = await Promise.all([pIds.length ? byIds(T("Pointages"), pIds) : [], listAll(T("Effectifs")), listAll(T("Joueurs"))]);
      // Assiduité seule : on neutralise les montants (les primes restent dans /api/primes).
      const neutral = { id: team.id, fields: { ...team.fields, "Primes actives": false } };
      const r = computeMonth({ team: neutral, month: b.month, seances, pointages, effectifs, players, today: todayParis() });
      const lines = r.lines.filter((l) => l.seances || l.excuses).map((l) => ({ joueur: l.joueur, nom: l.nom, statut: l.statut, presences: l.presences, seances: l.seances, excuses: l.excuses, taux: l.taux, entrainements: l.entrainements, matchs: l.matchs }));
      res.status(200).json({ month: b.month, counters: r.counters, tauxMoyen: r.tauxMoyen, lines });
      return;
    }

    // -------------------------------------------------------------- Fiche d'un joueur
    if (b.action !== "fiche") { res.status(400).json({ error: "Action inconnue : " + b.action }); return; }
    if (!isId(b.joueurId)) { res.status(400).json({ error: "Joueur manquant." }); return; }
    let p; try { p = await at("GET", T("Joueurs") + "/" + b.joueurId); } catch (e) { res.status(404).json({ error: "Joueur introuvable." }); return; }
    const effIds = fv(p, "Effectifs") || [];
    const myEfx = effIds.length ? await byIds(T("Effectifs"), effIds) : [];
    const teamIds = [...new Set([].concat(...myEfx.map((e) => fv(e, "Équipe") || [])))];
    if (!teamIds.some((t) => seesTeam(sess, t))) { res.status(403).json({ error: "Ce joueur n'est dans aucune de tes équipes." }); return; }
    const visibleTeams = teamIds.filter((t) => seesTeam(sess, t));
    const today = todayParis(), from = seasonStart(today);
    const [teams, seasonS, allEfx] = await Promise.all([
      byIds(T("Équipes"), visibleTeams),
      listAll(T("Séances"), "AND(IS_AFTER({Date}, '" + (() => { const d = new Date(from + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })() + "'), IS_BEFORE({Date}, '" + today + "'))"),
      listAll(T("Effectifs")),
    ]);
    // On ne garde que les séances des équipes visibles, pointées (ou annulées pour mémoire), et comptées.
    const S = seasonS.filter((s) => (fv(s, "Équipe") || []).some((t) => visibleTeams.includes(t)));
    const myP = (fv(p, "Pointages") || []).length ? await byIds(T("Pointages"), fv(p, "Pointages")) : [];
    const stateOf = new Map(myP.map((x) => [(fv(x, "Séance") || [])[0], fv(x, "État") || "Présent"]));
    const teamName = (id) => fv(teams.find((t) => t.id === id), "Nom") || "Équipe";
    const months = [];
    for (let m = from.slice(0, 7); m <= today.slice(0, 7); m = nextMonth(m)) months.push(m);
    const perTeam = visibleTeams.map((tid) => {
      const efxT = myEfx.filter((e) => (fv(e, "Équipe") || []).includes(tid));
      const rosterT = allEfx.filter((e) => (fv(e, "Équipe") || []).includes(tid));
      const done = S.filter((s) => (fv(s, "Équipe") || []).includes(tid) && fv(s, "Statut") === "Pointée" && counts(s));
      const byMonth = months.map((m) => {
        const ms = done.filter((s) => monthOf(fv(s, "Date")) === m);
        let seances = 0, pres = 0, exc = 0, entr = 0, matchs = 0, teamPres = 0, teamTot = 0, vict = 0;
        for (const s of ms) {
          const d = fv(s, "Date");
          // Moyenne de l'équipe : pointages de la séance ÷ joueurs dans l'effectif ce jour-là.
          const eligible = new Set(rosterT.filter((e) => inRange(e, d)).map((e) => (fv(e, "Joueur") || [])[0])).size;
          if (eligible) { teamTot += eligible; teamPres += Math.min((fv(s, "Pointages") || []).length, eligible); }
          if (!efxT.some((e) => inRange(e, d))) continue;
          const st = stateOf.get(s.id);
          seances++;
          if (st === "Présent") { pres++; fv(s, "Type") === "Match" ? matchs++ : entr++; if (fv(s, "Type") === "Match" && fv(s, "Résultat") === "Victoire") vict++; }
          else if (st === "Excusé") exc++;
        }
        return { month: m, seances, presences: pres, excuses: exc, entrainements: entr, matchs, taux: seances ? pres / seances : null, moyenne: teamTot ? teamPres / teamTot : null, teamPres, teamTot, victoires: vict };
      });
      return {
        teamId: tid, nom: teamName(tid), primes: !!fv(teams.find((t) => t.id === tid), "Primes actives"),
        effectifs: efxT.map((e) => ({ statut: fv(e, "Statut") || "Effectif", entree: fv(e, "Entrée") || null, sortie: fv(e, "Sortie") || null })),
        months: byMonth,
      };
    });
    // Dernières séances (toutes équipes visibles), du plus récent au plus ancien.
    const recent = S.filter((s) => fv(s, "Statut") === "Pointée" && counts(s))
      .filter((s) => myEfx.some((e) => (fv(e, "Équipe") || []).some((t) => (fv(s, "Équipe") || []).includes(t)) && inRange(e, fv(s, "Date"))))
      .sort((a, c) => String(fv(c, "Date") + (fv(c, "Heure") || "")).localeCompare(String(fv(a, "Date") + (fv(a, "Heure") || ""))))
      .slice(0, 20)
      .map((s) => ({ id: s.id, teamId: (fv(s, "Équipe") || [])[0], date: fv(s, "Date"), heure: fv(s, "Heure") || "", type: fv(s, "Type"), equipe: teamName((fv(s, "Équipe") || [])[0]), adversaire: fv(s, "Adversaire") || "", resultat: fv(s, "Résultat") || "", score: fv(s, "Score VHB") != null && fv(s, "Score adverse") != null ? fv(s, "Score VHB") + "-" + fv(s, "Score adverse") : "", etat: stateOf.get(s.id) || "Absent" }));
    // Primes (lignes validées ou ajoutées), seulement pour les droits Primes.
    let primes = null;
    if (canAny(sess, READ_PRIMES)) {
      const ids = fv(p, "Primes") || [];
      const lines = ids.length ? await byIds(T("Primes – Lignes"), ids) : [];
      primes = lines.filter((l) => (fv(l, "Équipe") || []).some((t) => visibleTeams.includes(t)))
        .map((l) => ({ id: l.id, periode: fv(l, "Période"), type: fv(l, "Type"), montant: Number(fv(l, "Montant")) || 0, motif: fv(l, "Motif") || "", paiement: fv(l, "Paiement") || "À payer", valide: !!(fv(l, "Mois") || []).length, payeLe: fv(l, "Payé le") || null, equipe: teamName((fv(l, "Équipe") || [])[0]) }))
        .sort((a, c) => String(c.periode).localeCompare(String(a.periode)));
    }
    // Primes regroupées par mois : mois validés (montant figé + état du paiement) et mois encore ouverts
    // (mois en cours et mois précédent non validé : montant provisoire calculé en direct).
    let mois = null;
    if (primes) {
      const byKey = new Map();
      for (const l of primes.filter((x) => x.valide)) {
        const k = l.periode + "|" + l.equipe; const o = byKey.get(k) || { periode: l.periode, equipe: l.equipe, montant: 0, pay: [] };
        o.montant += l.montant; o.pay.push(l.paiement); byKey.set(k, o);
      }
      mois = [...byKey.values()].map((o) => ({ periode: o.periode, equipe: o.equipe, montant: Math.round(o.montant * 100) / 100,
        statut: o.pay.every((x) => x === "Payé") ? "Payé" : o.pay.every((x) => x === "Payé" || x === "Mis en paiement") ? "Mis en paiement" : "Validé" }));
      const cur = today.slice(0, 7);
      for (const t of teams.filter((x) => fv(x, "Primes actives"))) {
        // Tous les mois de la saison non encore validés (pas seulement le mois en cours et le précédent).
        const months = []; for (let m = from.slice(0, 7); m <= cur; m = nextMonth(m)) months.push(m);
        for (const m of months) {
          const val = (await listAll(T("Primes – Mois"), "{Mois}='" + m + "'")).some((r) => (fv(r, "Équipe") || []).includes(t.id) && fv(r, "Statut") === "Validé");
          if (val) continue;
          const sm = (await listAll(T("Séances"), "AND(IS_AFTER({Date}, '" + (() => { const d = new Date(m + "-01T12:00:00Z"); d.setUTCDate(0); return d.toISOString().slice(0, 10); })() + "'), IS_BEFORE({Date}, '" + nextMonth(m) + "-01'))")).filter((x) => (fv(x, "Équipe") || []).includes(t.id));
          const pIds = [].concat(...sm.map((x) => fv(x, "Pointages") || []));
          const pts = pIds.length ? await byIds(T("Pointages"), pIds) : [];
          const extras = ((fv(p, "Primes") || []).length ? await byIds(T("Primes – Lignes"), fv(p, "Primes")) : []).filter((l) => !(fv(l, "Mois") || []).length && fv(l, "Période") === m && fv(l, "Type") !== "Normale" && (fv(l, "Équipe") || []).includes(t.id));
          const r = computeMonth({ team: t, month: m, seances: sm, pointages: pts, effectifs: allEfx, players: [p], extras, today });
          const line = r.lines.find((l) => l.joueur === p.id);
          if (line && (line.seances || line.total)) mois.push({ periode: m, equipe: fv(t, "Nom") || "", montant: line.total, statut: "Provisoire" });
        }
      }
      mois.sort((a, c) => String(c.periode).localeCompare(String(a.periode)));
    }
    res.status(200).json({
      joueur: { id: p.id, nom: fv(p, "Nom") || "", prenom: fv(p, "Prénom") || "", annee: fv(p, "Année de naissance") || null, licence: fv(p, "Licence") || "", poste: fv(p, "Poste") || "" },
      canEditPoste: canAny(sess, ["eff"]) && (sess.scope === "all" || perTeam.some((x) => seesTeam(sess, x.teamId))),
      saison: from.slice(0, 4) + "-" + (Number(from.slice(0, 4)) + 1), teams: perTeam, recent, primes, mois, today,
    });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
