// Assistant de fin de saison (appelé par /api/joueur avec action « saison… »).
// Réservé aux personnes qui gèrent les effectifs ET voient toutes les équipes.
//   saisonBilan    { season: "2026-2027" } → ce qui reste à régler (mois non validés, primes non payées, séances non pointées),
//                                            équipes, joueurs, créneaux, volume de données
//   saisonArchive  { season }              → toutes les données de la saison (pour l'archive téléchargée)
//   saisonCloture  { season, archived: true, teams: [{ id, keep, staff, leavers: [effectifId], rythmes, pp, pv }], purge }
//        keep     : reconduire l'équipe (sa saison passe à la suivante) — sinon elle est archivée
//        staff    : garder le staff rattaché (sinon il est détaché ; toujours détaché pour une équipe archivée)
//        leavers  : joueurs qui ne reprennent pas → date de sortie au 31 juillet
//        rythmes  : recopier les créneaux d'entraînement sur la nouvelle saison
//        pp / pv  : barème de la nouvelle saison (droit « Paramétrer les barèmes »)
//        purge    : supprime les pointages de plus de deux saisons (les primes et les séances restent)
import { at, can, logAction } from "./_lib.js";

const T = (n) => encodeURIComponent(n);
const fv = (r, k) => ((r && r.fields) || {})[k];
const isId = (x) => typeof x === "string" && /^[A-Za-z0-9]{2,24}$/.test(x);
const todayParis = () => new Date(Date.now() + 3600e3).toISOString().slice(0, 10);
export const parseSeason = (s) => { const m = String(s || "").match(/^(\d{4})-(\d{4})$/); if (!m || Number(m[2]) !== Number(m[1]) + 1) return null; const y = Number(m[1]); return { y, label: y + "-" + (y + 1), next: (y + 1) + "-" + (y + 2), start: y + "-08-01", end: (y + 1) + "-07-31" }; };
const dayBefore = (d) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); };
const dayAfter = (d) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };

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
const between = (a, b) => "AND(IS_AFTER({Date}, '" + dayBefore(a) + "'), IS_BEFORE({Date}, '" + dayAfter(b) + "'))";
async function patchMany(table, recs) { for (let i = 0; i < recs.length; i += 10) await at("PATCH", table, { records: recs.slice(i, i + 10), typecast: true }); }
async function createMany(table, recs) { for (let i = 0; i < recs.length; i += 10) await at("POST", table, { records: recs.slice(i, i + 10), typecast: true }); }
async function deleteMany(table, ids) { for (let i = 0; i < ids.length; i += 10) await at("DELETE", table + "?" + ids.slice(i, i + 10).map((id) => "records[]=" + encodeURIComponent(id)).join("&")); }
const monthsOf = (S) => Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(S.y, 7 + i, 1)).toISOString().slice(0, 7));

export async function saison(sess, b, res) {
  if (!can(sess, "eff") || sess.scope !== "all") { res.status(403).json({ error: "Réservé aux personnes qui gèrent les effectifs de toutes les équipes." }); return; }
  const S = parseSeason(b.season);
  if (!S) { res.status(400).json({ error: "Saison invalide (ex. 2026-2027)." }); return; }
  const today = todayParis();

  if (b.action === "saisonBilan") {
    const months = monthsOf(S);
    const [teams, efx, players, staff, rythmes, seances, mois, lignes] = await Promise.all([
      listAll(T("Équipes")), listAll(T("Effectifs")), listAll(T("Joueurs")), listAll(T("Staff")), listAll(T("Rythmes")),
      listAll(T("Séances"), between(S.start, S.end)),
      listAll(T("Primes – Mois"), "OR(" + months.map((m) => "{Mois}='" + m + "'").join(",") + ")"),
      listAll(T("Primes – Lignes"), "OR(" + months.map((m) => "{Période}='" + m + "'").join(",") + ")"),
    ]);
    const users = staff.length ? await byIds(T("Utilisateurs"), [...new Set([].concat(...staff.map((s) => fv(s, "Personne") || [])))]) : [];
    const uName = (id) => { const u = users.find((x) => x.id === id); return u ? [fv(u, "Prénom"), fv(u, "Nom")].filter(Boolean).join(" ") || fv(u, "Email") : "?"; };
    const pName = (id) => { const p = players.find((x) => x.id === id); return p ? ((fv(p, "Prénom") || "") + " " + (fv(p, "Nom") || "")).trim() : "Joueur"; };
    const active = teams.filter((t) => !fv(t, "Archivée")).sort((a, c) => (fv(a, "Ordre") || 99) - (fv(c, "Ordre") || 99));
    const out = active.map((t) => {
      const ss = seances.filter((s) => (fv(s, "Équipe") || []).includes(t.id));
      const late = ss.filter((s) => fv(s, "Statut") !== "Pointée" && fv(s, "Statut") !== "Annulée" && fv(s, "Date") < today).length;
      const primes = !!fv(t, "Primes actives");
      const validated = new Set(mois.filter((m) => (fv(m, "Équipe") || []).includes(t.id) && fv(m, "Statut") === "Validé").map((m) => fv(m, "Mois")));
      const withSessions = new Set(ss.filter((s) => fv(s, "Statut") === "Pointée").map((s) => String(fv(s, "Date")).slice(0, 7)));
      const openMonths = primes ? months.filter((m) => withSessions.has(m) && !validated.has(m) && m < today.slice(0, 7)) : [];
      const unpaid = lignes.filter((l) => (fv(l, "Équipe") || []).includes(t.id) && fv(l, "Paiement") !== "Payé" && (fv(l, "Mois") || []).length);
      return {
        id: t.id, nom: fv(t, "Nom") || "Équipe", saison: fv(t, "Saison") || "", primes, pp: fv(t, "Prime présence") ?? null, pv: fv(t, "Prime victoire") ?? null,
        joueurs: efx.filter((e) => (fv(e, "Équipe") || []).includes(t.id) && (!fv(e, "Sortie") || fv(e, "Sortie") > S.end))
          .map((e) => ({ effectif: e.id, joueur: (fv(e, "Joueur") || [])[0], nom: pName((fv(e, "Joueur") || [])[0]), statut: fv(e, "Statut") || "Effectif" }))
          .sort((a, c) => a.nom.localeCompare(c.nom, "fr")),
        staff: staff.filter((s) => (fv(s, "Équipe") || []).includes(t.id)).map((s) => ({ id: s.id, nom: uName((fv(s, "Personne") || [])[0]), fonction: fv(s, "Fonction") || "" })),
        rythmes: rythmes.filter((r) => (fv(r, "Équipe") || []).includes(t.id) && (!fv(r, "Au") || fv(r, "Au") >= S.start)).map((r) => ({ id: r.id, jour: fv(r, "Jour") || "", heure: fv(r, "Heure") || "", lieu: fv(r, "Lieu") || "" })),
        seances: ss.length, late, openMonths,
        unpaid: { count: unpaid.length, total: Math.round(unpaid.reduce((a, l) => a + (Number(fv(l, "Montant")) || 0), 0) * 100) / 100 },
      };
    });
    const cutoff = (S.y - 1) + "-08-01";
    const old = await listAll(T("Séances"), "IS_BEFORE({Date}, '" + cutoff + "')");
    res.status(200).json({ season: S.label, next: S.next, start: S.start, end: S.end, teams: out,
      volume: { seances: seances.length, pointages: seances.reduce((a, s) => a + (fv(s, "Pointages") || []).length, 0) },
      purge: { before: cutoff, pointages: old.reduce((a, s) => a + (fv(s, "Pointages") || []).length, 0) } });
    return;
  }

  if (b.action === "saisonArchive") {
    const months = monthsOf(S);
    const [teams, efx, players, seances, mois, lignes] = await Promise.all([
      listAll(T("Équipes")), listAll(T("Effectifs")), listAll(T("Joueurs")),
      listAll(T("Séances"), between(S.start, S.end)),
      listAll(T("Primes – Mois"), "OR(" + months.map((m) => "{Mois}='" + m + "'").join(",") + ")"),
      listAll(T("Primes – Lignes"), "OR(" + months.map((m) => "{Période}='" + m + "'").join(",") + ")"),
    ]);
    const pIds = [].concat(...seances.map((s) => fv(s, "Pointages") || []));
    const pointages = pIds.length ? await byIds(T("Pointages"), pIds) : [];
    const strip = (r) => ({ id: r.id, ...r.fields });
    await logAction(sess, "Archive de saison téléchargée", "Séances", "", S.label + " · " + seances.length + " séances · " + pointages.length + " pointages");
    res.status(200).json({ season: S.label, exportedAt: new Date().toISOString(),
      equipes: teams.map(strip), effectifs: efx.map(strip), joueurs: players.map((p) => ({ id: p.id, Nom: fv(p, "Nom"), "Prénom": fv(p, "Prénom"), "Année de naissance": fv(p, "Année de naissance") || null, Licence: fv(p, "Licence") || "" })),
      seances: seances.map(strip), pointages: pointages.map(strip), primesMois: mois.map(strip), primesLignes: lignes.map(strip) });
    return;
  }

  if (b.action === "saisonCloture") {
    if (b.archived !== true) { res.status(400).json({ error: "Télécharge d'abord l'archive de la saison." }); return; }
    const plan = Array.isArray(b.teams) ? b.teams.filter((x) => x && isId(x.id)) : [];
    if (!plan.length) { res.status(400).json({ error: "Aucune équipe dans le plan." }); return; }
    const [teams, efx, staff, rythmes] = await Promise.all([listAll(T("Équipes")), listAll(T("Effectifs")), listAll(T("Staff")), listAll(T("Rythmes"))]);
    const done = { reconduites: 0, archivees: 0, sorties: 0, staffDetache: 0, creneaux: 0, baremes: 0, purges: 0 };
    for (const p of plan) {
      const t = teams.find((x) => x.id === p.id);
      if (!t || fv(t, "Archivée")) continue;
      if (fv(t, "Saison") === S.next) continue; // déjà traitée (assistant relancé)
      const nom = fv(t, "Nom") || "Équipe";
      const openEfx = efx.filter((e) => (fv(e, "Équipe") || []).includes(t.id) && (!fv(e, "Sortie") || fv(e, "Sortie") > S.end));
      const teamStaff = staff.filter((s) => (fv(s, "Équipe") || []).includes(t.id));
      if (p.keep) {
        const fields = { "Saison": S.next };
        if (can(sess, "param") && fv(t, "Primes actives")) {
          const num = (x) => (x === "" || x == null ? undefined : Math.max(0, Math.min(1000, Number(String(x).replace(",", ".")))));
          const pp = num(p.pp), pv = num(p.pv);
          if (pp !== undefined && !isNaN(pp) && pp !== fv(t, "Prime présence")) { fields["Prime présence"] = pp; done.baremes++; }
          if (pv !== undefined && !isNaN(pv) && pv !== fv(t, "Prime victoire")) { fields["Prime victoire"] = pv; done.baremes++; }
        }
        await at("PATCH", T("Équipes") + "/" + t.id, { fields, typecast: true });
        const leavers = new Set((p.leavers || []).filter(isId));
        const out = openEfx.filter((e) => leavers.has(e.id));
        if (out.length) await patchMany(T("Effectifs"), out.map((e) => ({ id: e.id, fields: { "Sortie": S.end } })));
        done.sorties += out.length;
        if (!p.staff && teamStaff.length) { await deleteMany(T("Staff"), teamStaff.map((s) => s.id)); done.staffDetache += teamStaff.length; }
        if (p.rythmes) {
          const cur = rythmes.filter((r) => (fv(r, "Équipe") || []).includes(t.id) && (!fv(r, "Au") || fv(r, "Au") >= S.start) && (!fv(r, "Du") || fv(r, "Du") <= S.end));
          await createMany(T("Rythmes"), cur.map((r) => ({ fields: { "Libellé": nom + " · " + (fv(r, "Jour") || "") + " " + (fv(r, "Heure") || ""), "Équipe": [t.id], "Jour": fv(r, "Jour"), "Heure": fv(r, "Heure"), "Lieu": fv(r, "Lieu") || "", "Du": (S.y + 1) + "-09-01", "Au": (S.y + 2) + "-06-30" } })));
          done.creneaux += cur.length;
        }
        done.reconduites++;
        await logAction(sess, "Fin de saison : équipe reconduite", "Équipes", t.id, nom + " → " + S.next + " · " + out.length + " départ(s)" + (!p.staff ? " · staff détaché" : "") + (p.rythmes ? " · créneaux recopiés" : ""));
      } else {
        await at("PATCH", T("Équipes") + "/" + t.id, { fields: { "Archivée": true }, typecast: true });
        if (openEfx.length) await patchMany(T("Effectifs"), openEfx.map((e) => ({ id: e.id, fields: { "Sortie": S.end } })));
        if (teamStaff.length) await deleteMany(T("Staff"), teamStaff.map((s) => s.id));
        done.archivees++; done.sorties += openEfx.length; done.staffDetache += teamStaff.length;
        await logAction(sess, "Fin de saison : équipe archivée", "Équipes", t.id, nom + " · " + S.label + " · " + openEfx.length + " joueur(s) sortis");
      }
    }
    if (b.purge === true) {
      const cutoff = (S.y - 1) + "-08-01";
      const old = await listAll(T("Séances"), "IS_BEFORE({Date}, '" + cutoff + "')");
      const ids = [].concat(...old.map((s) => fv(s, "Pointages") || []));
      if (ids.length) await deleteMany(T("Pointages"), ids);
      done.purges = ids.length;
      await logAction(sess, "Fin de saison : pointages anciens supprimés", "Pointages", "", ids.length + " pointage(s) antérieurs au " + cutoff);
    }
    res.status(200).json({ ok: true, season: S.label, next: S.next, done });
    return;
  }
  res.status(400).json({ error: "Action inconnue." });
}
