// Calcul des primes d'un mois pour une équipe — fonction pure, sans accès réseau.
// Règles (cahier des charges v2, § 4) :
//  • séances comptées : entraînements et matchs, + séances supplémentaires / stages cochés « Compte primes » ;
//  • séance annulée : sort du calcul ; séance non pointée : n'entre pas, mais bloque la validation ;
//  • un joueur n'est évalué que sur les séances où il faisait partie de l'effectif (entrée / sortie) ;
//  • case vide = absent ; « Excusé » = absence, ou séance non comptée selon le réglage de l'équipe ;
//  • prime de présence (Effectif seulement) = barème × présences ÷ séances, arrondie au centime ;
//  • prime de victoire (Effectif et Renfort) = barème × matchs gagnés où le joueur était sur la feuille ;
//  • statut du joueur : celui de sa fiche d'effectif au 1er du mois ;
//  • + primes exceptionnelles et régularisations rattachées au mois.

export const round2 = (x) => Math.round((Number(x) || 0) * 100 + 1e-9) / 100;
const fv = (r, k) => ((r && r.fields) || {})[k];
export const monthOf = (d) => String(d || "").slice(0, 7);
export function nextMonth(m) {
  const [y, mo] = m.split("-").map(Number);
  return mo === 12 ? (y + 1) + "-01" : y + "-" + String(mo + 1).padStart(2, "0");
}
export const counts = (s) => {
  const ty = fv(s, "Type");
  return ty === "Entraînement" || ty === "Match" || !!fv(s, "Compte primes");
};

// Fiche d'effectif valable au 1er du mois (ou, à défaut, la plus récente dans le mois).
function statusAt(efxList, month) {
  const first = month + "-01", last = month + "-31";
  const inRange = (e, d) => (!fv(e, "Entrée") || fv(e, "Entrée") <= d) && (!fv(e, "Sortie") || fv(e, "Sortie") >= d);
  const at1 = efxList.find((e) => inRange(e, first));
  if (at1) return fv(at1, "Statut") || "Effectif";
  const later = efxList.filter((e) => (!fv(e, "Entrée") || fv(e, "Entrée") <= last) && (!fv(e, "Sortie") || fv(e, "Sortie") >= first));
  return later.length ? fv(later[later.length - 1], "Statut") || "Effectif" : "Effectif";
}

/**
 * @param {object} p
 *  team      : enregistrement Équipes
 *  month     : "AAAA-MM"
 *  seances   : séances de l'équipe (au moins celles du mois)
 *  pointages : pointages de ces séances (champs Séance, Joueur, État)
 *  effectifs : fiches d'effectif de l'équipe
 *  players   : joueurs (pour les noms)
 *  extras    : lignes Exceptionnelle / Régularisation de la période
 *  today     : "AAAA-MM-JJ"
 */
export function computeMonth({ team, month, seances, pointages, effectifs, players, extras = [], today }) {
  const tf = (team && team.fields) || {};
  const active = !!tf["Primes actives"];
  const barPres = Number(tf["Prime présence"]) || 0;
  const barVict = Number(tf["Prime victoire"]) || 0;
  const excuseSkips = tf["Excusé compte comme"] === "Séance non comptée";

  const inMonth = seances.filter((s) => monthOf(fv(s, "Date")) === month && (fv(s, "Équipe") || []).includes(team.id))
    .sort((a, b) => String(fv(a, "Date") + (fv(a, "Heure") || "")).localeCompare(String(fv(b, "Date") + (fv(b, "Heure") || ""))));
  const cancelled = inMonth.filter((s) => fv(s, "Statut") === "Annulée");
  const live = inMonth.filter((s) => fv(s, "Statut") !== "Annulée");
  const counted = live.filter(counts);
  const pending = counted.filter((s) => fv(s, "Statut") !== "Pointée");
  const done = counted.filter((s) => fv(s, "Statut") === "Pointée");

  // État de chaque (séance, joueur).
  const state = new Map();
  for (const p of pointages) {
    const s = (fv(p, "Séance") || [])[0], j = (fv(p, "Joueur") || [])[0];
    if (s && j) state.set(s + "|" + j, fv(p, "État") || "Présent");
  }
  const byPlayer = new Map();
  for (const e of effectifs) {
    if (!(fv(e, "Équipe") || []).includes(team.id)) continue;
    const j = (fv(e, "Joueur") || [])[0]; if (!j) continue;
    if (!byPlayer.has(j)) byPlayer.set(j, []);
    byPlayer.get(j).push(e);
  }
  const pName = (id) => { const p = players.find((x) => x.id === id); return p ? ((fv(p, "Prénom") || "") + " " + (fv(p, "Nom") || "")).trim() : "Joueur"; };
  const pSort = (id) => { const p = players.find((x) => x.id === id); return p ? String(fv(p, "Nom") || "") + " " + String(fv(p, "Prénom") || "") : "~"; };

  const lines = [];
  for (const [j, efx] of byPlayer) {
    const member = (d) => efx.some((e) => (!fv(e, "Entrée") || fv(e, "Entrée") <= d) && (!fv(e, "Sortie") || fv(e, "Sortie") >= d));
    const statut = statusAt(efx, month);
    let seancesN = 0, pres = 0, entr = 0, matchs = 0, vict = 0, excuses = 0;
    const detail = [];
    for (const s of done) {
      const d = fv(s, "Date");
      if (!member(d)) continue;
      const st = state.get(s.id + "|" + j) || "Absent";
      detail.push({ s: s.id, st });
      if (st === "Excusé") { excuses++; if (excuseSkips) continue; }
      seancesN++;
      if (st === "Présent") {
        pres++;
        if (fv(s, "Type") === "Match") { matchs++; if (fv(s, "Résultat") === "Victoire") vict++; }
        else entr++;
      }
    }
    const myExtras = extras.filter((x) => (fv(x, "Joueur") || [])[0] === j);
    if (!seancesN && !myExtras.length && !detail.length) continue;
    const taux = seancesN ? pres / seancesN : 0;
    const primePres = active && statut === "Effectif" && seancesN ? round2(barPres * pres / seancesN) : 0;
    const primeVict = active ? round2(barVict * vict) : 0;
    const extra = round2(myExtras.reduce((t, x) => t + (Number(fv(x, "Montant")) || 0), 0));
    lines.push({
      joueur: j, nom: pName(j), tri: pSort(j), statut,
      entrainements: entr, matchs, presences: pres, seances: seancesN, excuses, taux,
      primePresence: primePres, victoires: vict, primeVictoire: primeVict,
      extras: myExtras.map((x) => ({ id: x.id, type: fv(x, "Type"), montant: Number(fv(x, "Montant")) || 0, motif: fv(x, "Motif") || "" })),
      extra, total: round2(primePres + primeVict + extra), detail,
    });
  }
  // Primes exceptionnelles pour un joueur qui n'est plus dans l'effectif.
  for (const x of extras) {
    const j = (fv(x, "Joueur") || [])[0];
    if (!j || lines.some((l) => l.joueur === j)) continue;
    const m = Number(fv(x, "Montant")) || 0;
    lines.push({ joueur: j, nom: pName(j), tri: pSort(j), statut: "—", entrainements: 0, matchs: 0, presences: 0, seances: 0, excuses: 0, taux: 0, primePresence: 0, victoires: 0, primeVictoire: 0, extras: [{ id: x.id, type: fv(x, "Type"), montant: m, motif: fv(x, "Motif") || "" }], extra: round2(m), total: round2(m), detail: [] });
  }
  lines.sort((a, b) => a.tri.localeCompare(b.tri, "fr"));

  const tot = (k) => round2(lines.reduce((t, l) => t + l[k], 0));
  const monthOver = !today || today >= nextMonth(month) + "-01";
  return {
    month, teamId: team.id, active, bareme: { presence: barPres, victoire: barVict, excuse: excuseSkips ? "Séance non comptée" : "Absence" },
    counters: {
      entrainements: done.filter((s) => fv(s, "Type") !== "Match").length,
      matchs: done.filter((s) => fv(s, "Type") === "Match").length,
      annulees: cancelled.length, comptees: done.length, aPointer: pending.length,
      victoires: done.filter((s) => fv(s, "Type") === "Match" && fv(s, "Résultat") === "Victoire").length,
    },
    seances: inMonth.map((s) => ({ id: s.id, date: fv(s, "Date"), heure: fv(s, "Heure") || "", type: fv(s, "Type"), statut: fv(s, "Statut"), compte: counts(s), adversaire: fv(s, "Adversaire") || "", resultat: fv(s, "Résultat") || "" })),
    pending: pending.map((s) => ({ id: s.id, date: fv(s, "Date"), type: fv(s, "Type") })),
    lines,
    totals: { presence: tot("primePresence"), victoire: tot("primeVictoire"), extra: tot("extra"), total: tot("total") },
    tauxMoyen: lines.filter((l) => l.seances).length ? lines.filter((l) => l.seances).reduce((t, l) => t + l.taux, 0) / lines.filter((l) => l.seances).length : 0,
    canValidate: active && pending.length === 0 && monthOver && done.length > 0,
    blockers: [
      !active ? "Les primes ne sont pas activées pour cette équipe." : null,
      pending.length ? pending.length + " séance(s) à pointer avant de valider." : null,
      !monthOver ? "Le mois n'est pas terminé." : null,
      active && !done.length ? "Aucune séance pointée ce mois-ci." : null,
    ].filter(Boolean),
  };
}
