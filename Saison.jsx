// Étape 7 — Assistant de fin de saison (Admin › Équipes › Fin de saison).
// 1 Bilan · 2 Équipes · 3 Joueurs · 4 Archive · 5 Confirmation. Tout s'exécute côté serveur (/api/joueur, actions saison…).
import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { dbForget, RED, YELLOW, BLACK, TEXT, MUT, BORDER, OK } from "./App.jsx";

async function api(payload) {
  const r = await fetch("/api/joueur", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) window.dispatchEvent(new Event("vhb-auth-lost"));
  if (!r.ok) throw new Error(j.error || "Erreur " + r.status);
  return j;
}
const eur = (n) => (Number(n) || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const mLabel = (m) => MOIS[Number(m.slice(5)) - 1] + " " + m.slice(0, 4);
function save(name, text, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
}
const csvCell = (v) => { const s = String(v ?? ""); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
// Saison à clôturer par défaut : la plus fréquente parmi les équipes, sinon celle qui contient aujourd'hui (coupure au 1er août).
export function defaultSeason(teams) {
  const c = {}; (teams || []).forEach((t) => { const s = (t.fields || {})["Saison"]; if (/^\d{4}-\d{4}$/.test(s || "")) c[s] = (c[s] || 0) + 1; });
  const best = Object.keys(c).sort((a, b) => c[b] - c[a])[0];
  if (best) return best;
  const d = new Date(); const y = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1; return y + "-" + (y + 1);
}

const STEPS = ["Bilan", "Équipes", "Joueurs", "Archive", "Confirmation"];
const Box = ({ children, tone, style }) => <div style={{ background: tone === "warn" ? "#FFF6D6" : tone === "bad" ? "#FDECEC" : tone === "ok" ? "#E7F4EA" : "#F7F8FA", color: tone === "warn" ? "#5C4600" : tone === "bad" ? "#9E1B1B" : tone === "ok" ? "#1F5C30" : TEXT, borderRadius: 12, padding: "10px 12px", fontSize: 13.5, lineHeight: 1.5, ...style }}>{children}</div>;
const Check = ({ id, checked, onChange, children, disabled }) => <label htmlFor={id} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, cursor: disabled ? "default" : "pointer", padding: "6px 0", opacity: disabled ? .5 : 1 }}>
  <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} style={{ width: 20, height: 20, marginTop: 1, accentColor: RED, flex: "0 0 auto" }} /><span>{children}</span></label>;

export function SeasonWizard({ teams, canParam, onClose, onDone }) {
  const [season, setSeason] = useState(() => defaultSeason(teams));
  const [bilan, setBilan] = useState(null);
  const [err, setErr] = useState("");
  const [step, setStep] = useState(0);
  const [plan, setPlan] = useState({});          // teamId → { keep, staff, rythmes, pp, pv, leavers: Set }
  const [archived, setArchived] = useState(false);
  const [purge, setPurge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  useEffect(() => { const h = (e) => { if (e.key === "Escape" && !busy) onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose, busy]);
  useEffect(() => {
    setBilan(null); setErr(""); setArchived(false);
    api({ action: "saisonBilan", season }).then((b) => {
      setBilan(b);
      setPlan(Object.fromEntries(b.teams.map((t) => [t.id, { keep: true, staff: true, rythmes: t.rythmes.length > 0, pp: t.pp ?? "", pv: t.pv ?? "", leavers: new Set() }])));
    }).catch((e) => setErr(e.message));
  }, [season]);
  const upd = (id, patch) => setPlan((p) => ({ ...p, [id]: { ...p[id], ...patch } }));
  const y = Number(season.slice(0, 4));
  const kept = bilan ? bilan.teams.filter((t) => plan[t.id] && plan[t.id].keep) : [];
  const archivedTeams = bilan ? bilan.teams.filter((t) => plan[t.id] && !plan[t.id].keep) : [];
  const leaversN = kept.reduce((a, t) => a + plan[t.id].leavers.size, 0) + archivedTeams.reduce((a, t) => a + t.joueurs.length, 0);
  const issues = bilan ? bilan.teams.filter((t) => t.late || t.openMonths.length || t.unpaid.count) : [];

  const download = async () => {
    setBusy(true);
    try {
      const a = await api({ action: "saisonArchive", season });
      save("vhb-archive-" + season + ".json", JSON.stringify(a, null, 1), "application/json");
      const S = new Map(a.seances.map((s) => [s.id, s])), P = new Map(a.joueurs.map((p) => [p.id, p])), E = new Map(a.equipes.map((t) => [t.id, t]));
      const rows = [["Date", "Équipe", "Type", "Adversaire", "Joueur", "État"]].concat(a.pointages.map((p) => {
        const s = S.get((p["Séance"] || [])[0]) || {}; const j = P.get((p.Joueur || [])[0]) || {};
        return [s.Date || "", (E.get((s["Équipe"] || [])[0]) || {}).Nom || "", s.Type || "", s.Adversaire || "", ((j["Prénom"] || "") + " " + (j.Nom || "")).trim(), p["État"] || "Présent"];
      }).sort((x, z) => String(x[0]).localeCompare(String(z[0]))));
      setTimeout(() => save("vhb-pointages-" + season + ".csv", "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n"), "text/csv;charset=utf-8"), 400);
      setArchived(true);
    } catch (e) { alert(e.message); }
    setBusy(false);
  };
  const run = async () => {
    if (!confirm("Lancer la fin de saison " + season + " ?\n\n• " + kept.length + " équipe(s) reconduite(s) en " + bilan.next + "\n• " + archivedTeams.length + " équipe(s) archivée(s)\n• " + leaversN + " joueur(s) sortis au 31/07/" + (y + 1) + (purge ? "\n• " + bilan.purge.pointages + " pointage(s) anciens supprimés définitivement" : "") + "\n\nCette opération ne s'annule pas en un clic.")) return;
    setBusy(true);
    try {
      const r = await api({ action: "saisonCloture", season, archived: true, purge, teams: bilan.teams.map((t) => { const p = plan[t.id]; return { id: t.id, keep: p.keep, staff: p.staff, rythmes: p.rythmes, pp: p.pp, pv: p.pv, leavers: [...p.leavers] }; }) });
      ["Équipes", "Effectifs", "Staff", "Rythmes", "Pointages"].forEach((x) => dbForget(x));
      setResult(r);
    } catch (e) { alert(e.message); }
    setBusy(false);
  };
  const canNext = bilan && (step !== 3 || archived);

  const body = () => {
    if (result) return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Box tone="ok"><b>Saison {result.season} clôturée.</b> Le club est prêt pour {result.next}.</Box>
      <Box>{result.done.reconduites} équipe(s) reconduite(s) · {result.done.archivees} archivée(s) · {result.done.sorties} joueur(s) sortis · {result.done.creneaux} créneau(x) recopié(s){result.done.baremes ? " · barèmes mis à jour" : ""}{result.done.staffDetache ? " · " + result.done.staffDetache + " rattachement(s) de staff retirés" : ""}{result.done.purges ? " · " + result.done.purges + " pointage(s) anciens supprimés" : ""}.</Box>
      <Box tone="warn">Il reste à : ajouter les nouveaux joueurs (Admin › Équipes, ou l'import Excel), puis générer les séances de la nouvelle saison (Admin › Équipes › Rythme d'entraînement).</Box>
      <button className="btn btn-dark" onClick={onDone} style={{ alignSelf: "flex-start" }}>Terminer</button>
    </div>;
    if (err) return <Box tone="bad">{err}</Box>;
    if (!bilan) return <div style={{ color: MUT }}>Préparation du bilan de la saison…</div>;
    if (step === 0) return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 13.5, color: MUT, lineHeight: 1.55 }}>L'assistant prépare la saison {bilan.next} : il reconduit ou archive les équipes, enregistre les départs, recopie les créneaux et garde une archive de {season}. Rien n'est modifié avant la dernière étape.</div>
      {!issues.length && <Box tone="ok">Tout est en ordre : séances pointées, mois de primes validés et payés.</Box>}
      {issues.length > 0 && <Box tone="warn">Quelques points restent ouverts. Tu peux continuer, mais il vaut mieux les régler avant (la clôture ne les efface pas).</Box>}
      {bilan.teams.map((t) => <div key={t.id} className="card" style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 4, borderLeft: "4px solid " + (t.late || t.openMonths.length || t.unpaid.count ? YELLOW : OK) }}>
        <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}><b style={{ fontSize: 15 }}>{t.nom}</b><span style={{ fontSize: 12.5, color: MUT }}>{t.saison || "saison non renseignée"} · {t.joueurs.length} joueur(s) · {t.seances} séance(s)</span></div>
        {t.late > 0 && <span style={{ fontSize: 13, color: "#9E1B1B" }}>• {t.late} séance(s) jamais pointée(s)</span>}
        {t.openMonths.length > 0 && <span style={{ fontSize: 13, color: "#9E1B1B" }}>• Primes non validées : {t.openMonths.map(mLabel).join(", ")}</span>}
        {t.unpaid.count > 0 && <span style={{ fontSize: 13, color: "#9E1B1B" }}>• {t.unpaid.count} prime(s) validée(s) non payée(s) : {eur(t.unpaid.total)}</span>}
        {!t.late && !t.openMonths.length && !t.unpaid.count && <span style={{ fontSize: 13, color: "#1F5C30" }}>• Rien en attente</span>}
      </div>)}
    </div>;
    if (step === 1) return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 13.5, color: MUT }}>Pour chaque équipe : continue-t-elle en {bilan.next} ? Une équipe archivée disparaît des listes ; son historique (séances, primes) est conservé.</div>
      {bilan.teams.map((t) => { const p = plan[t.id]; return <div key={t.id} className="card" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6, borderLeft: "4px solid " + (p.keep ? OK : "#9AA0A8") }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <b style={{ flex: 1, fontSize: 15, minWidth: 120 }}>{t.nom}</b>
          <div role="group" aria-label={"Choix pour " + t.nom} style={{ display: "flex", gap: 4, background: "#E9EBEF", borderRadius: 30, padding: 4 }}>
            {[[true, "Reconduire"], [false, "Archiver"]].map(([v, l]) => <button key={l} aria-pressed={p.keep === v} onClick={() => upd(t.id, { keep: v })} style={{ minHeight: 34, padding: "0 12px", border: "none", borderRadius: 30, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 800, background: p.keep === v ? BLACK : "transparent", color: p.keep === v ? "#fff" : "#3A3F47" }}>{l}</button>)}
          </div>
        </div>
        {p.keep ? <>
          <Check id={"st-" + t.id} checked={p.staff} onChange={(v) => upd(t.id, { staff: v })} disabled={!t.staff.length}>Garder le staff{t.staff.length ? " : " + t.staff.map((s) => s.nom + (s.fonction ? " (" + s.fonction + ")" : "")).join(", ") : " (aucun staff rattaché)"}</Check>
          <Check id={"ry-" + t.id} checked={p.rythmes} onChange={(v) => upd(t.id, { rythmes: v })} disabled={!t.rythmes.length}>Recopier les créneaux sur {bilan.next}{t.rythmes.length ? " : " + t.rythmes.map((r) => r.jour + " " + r.heure).join(", ") : " (aucun créneau)"}</Check>
          {t.primes && <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div><label className="lbl" htmlFor={"pp-" + t.id}>Prime présence {bilan.next} (€/mois)</label><input id={"pp-" + t.id} className="inp" inputMode="decimal" disabled={!canParam} value={p.pp} onChange={(e) => upd(t.id, { pp: e.target.value })} style={{ width: 120 }} /></div>
            <div><label className="lbl" htmlFor={"pv-" + t.id}>Prime victoire (€)</label><input id={"pv-" + t.id} className="inp" inputMode="decimal" disabled={!canParam} value={p.pv} onChange={(e) => upd(t.id, { pv: e.target.value })} style={{ width: 120 }} /></div>
            {!canParam && <span style={{ fontSize: 12, color: MUT }}>Barème reporté tel quel (droit « Paramétrer les barèmes » requis pour le changer).</span>}
          </div>}
        </> : <span style={{ fontSize: 13, color: MUT }}>Les {t.joueurs.length} joueur(s) sortiront au 31/07/{y + 1} et le staff sera détaché de l'équipe.</span>}
      </div>; })}
    </div>;
    if (step === 2) return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 13.5, color: MUT }}>Décoche les joueurs qui ne reprennent pas : ils sortiront au 31/07/{y + 1}. Leur historique reste juste. Les nouveaux joueurs s'ajoutent ensuite comme d'habitude.</div>
      {!kept.length && <Box>Aucune équipe reconduite.</Box>}
      {kept.map((t) => { const p = plan[t.id]; return <div key={t.id} className="card" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
          <b style={{ flex: 1, fontSize: 15 }}>{t.nom}</b>
          <span style={{ fontSize: 12.5, color: MUT }}>{t.joueurs.length - p.leavers.size} reprennent · {p.leavers.size} départ(s)</span>
          <button className="btn btn-ghost" style={{ minHeight: 32, padding: "0 10px", fontSize: 12.5 }} onClick={() => upd(t.id, { leavers: p.leavers.size ? new Set() : new Set(t.joueurs.map((j) => j.effectif)) })}>{p.leavers.size ? "Tout cocher" : "Tout décocher"}</button>
        </div>
        {!t.joueurs.length && <span style={{ fontSize: 13, color: MUT }}>Aucun joueur dans l'effectif.</span>}
        {t.joueurs.map((j) => <Check key={j.effectif} id={"lv-" + j.effectif} checked={!p.leavers.has(j.effectif)} onChange={(v) => { const s = new Set(p.leavers); v ? s.delete(j.effectif) : s.add(j.effectif); upd(t.id, { leavers: s }); }}>{j.nom}{j.statut !== "Effectif" ? <span style={{ color: MUT }}> · {j.statut}</span> : null}</Check>)}
      </div>; })}
    </div>;
    if (step === 3) return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 13.5, color: MUT, lineHeight: 1.55 }}>Avant de clôturer, garde une copie complète de la saison {season} : {bilan.volume.seances} séance(s), {bilan.volume.pointages} pointage(s), les primes et les effectifs. Deux fichiers sont téléchargés : l'archive complète (.json) et la liste des pointages lisible dans Excel (.csv). Range-les dans le Drive du club.</div>
      <button className="btn btn-dark" disabled={busy} onClick={download} style={{ alignSelf: "flex-start" }}><i className="ti ti-download" aria-hidden="true" />{busy ? "Préparation…" : archived ? "Télécharger à nouveau" : "Télécharger l'archive " + season}</button>
      {archived && <Box tone="ok">Archive téléchargée.</Box>}
      <div className="card" style={{ padding: "12px 14px", borderLeft: "4px solid " + (purge ? RED : BORDER) }}>
        <Check id="purge" checked={purge} onChange={setPurge} disabled={!bilan.purge.pointages}>Supprimer les pointages de plus de deux saisons (avant le {new Date(bilan.purge.before + "T12:00:00").toLocaleDateString("fr-FR")}) : <b>{bilan.purge.pointages}</b> pointage(s).</Check>
        <div style={{ fontSize: 12.5, color: MUT, paddingLeft: 30 }}>Règle de conservation des données des joueurs (deux saisons). Les séances, les primes et les paiements sont conservés. Suppression définitive : fais-le seulement si l'archive de ces saisons est rangée.</div>
      </div>
    </div>;
    return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Box>Saison qui se termine : <b>{season}</b> → nouvelle saison : <b>{bilan.next}</b></Box>
      {kept.map((t) => { const p = plan[t.id]; return <Box key={t.id}><b>{t.nom}</b> reconduite · {t.joueurs.length - p.leavers.size} joueur(s) reprennent, {p.leavers.size} départ(s) · staff {p.staff ? "gardé" : "détaché"}{p.rythmes && t.rythmes.length ? " · " + t.rythmes.length + " créneau(x) recopié(s)" : ""}{t.primes ? " · barème " + (p.pp === "" ? "—" : p.pp) + " € / " + (p.pv === "" ? "—" : p.pv) + " €" : ""}</Box>; })}
      {archivedTeams.map((t) => <Box key={t.id} tone="warn"><b>{t.nom}</b> archivée · {t.joueurs.length} joueur(s) sortis · staff détaché</Box>)}
      {purge && <Box tone="bad">{bilan.purge.pointages} pointage(s) anciens seront supprimés définitivement.</Box>}
      {issues.length > 0 && <Box tone="warn">Rappel : des points restent ouverts dans le bilan (séances non pointées, primes non validées ou non payées). Ils resteront visibles après la clôture.</Box>}
      <button className="btn btn-red" disabled={busy} onClick={run} style={{ alignSelf: "flex-start" }}><i className="ti ti-flag" aria-hidden="true" />{busy ? "Clôture en cours…" : "Lancer la fin de saison"}</button>
    </div>;
  };

  return createPortal(<div role="dialog" aria-modal="true" aria-label="Fin de saison" style={{ position: "fixed", inset: 0, background: "rgba(16,17,20,.55)", zIndex: 205, display: "flex", justifyContent: "center", alignItems: "flex-start", overflowY: "auto", padding: "calc(12px + env(safe-area-inset-top)) 12px 40px" }}>
    <div className="card" style={{ position: "relative", width: "100%", maxWidth: 720, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ position: "sticky", top: 0, alignSelf: "flex-end", height: 0, zIndex: 3 }}><button aria-label="Fermer" disabled={busy} onClick={result ? onDone : onClose} style={{ position: "relative", top: -4, right: -6, boxShadow: "0 2px 8px rgba(0,0,0,.12)", width: 40, height: 40, borderRadius: 20, border: "none", background: "#EEF0F3", cursor: "pointer", fontSize: 22, lineHeight: 1 }}><span aria-hidden="true">×</span></button></div>
      <div style={{ paddingRight: 48 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: TEXT }}>Fin de saison</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
          <label htmlFor="fs-s" style={{ fontSize: 13, fontWeight: 700 }}>Saison qui se termine</label>
          <select id="fs-s" className="sel" value={season} disabled={step > 0 || !!result} onChange={(e) => { setSeason(e.target.value); setStep(0); }} style={{ width: "auto" }}>
            {[-1, 0, 1].map((k) => { const s = (y + k) + "-" + (y + k + 1); return <option key={s} value={s}>{s}</option>; })}
          </select>
        </div>
      </div>
      {!result && <ol aria-label="Étapes" style={{ display: "flex", gap: 4, listStyle: "none", padding: 0, margin: 0, flexWrap: "wrap" }}>
        {STEPS.map((s, i) => <li key={s} aria-current={i === step ? "step" : undefined} style={{ fontSize: 12, fontWeight: 800, padding: "5px 10px", borderRadius: 20, background: i === step ? BLACK : i < step ? "#E7F4EA" : "#EEF0F3", color: i === step ? "#fff" : i < step ? "#1F5C30" : MUT }}>{i + 1}. {s}</li>)}
      </ol>}
      {body()}
      {!result && bilan && <div style={{ display: "flex", gap: 8, borderTop: "1px solid #F0F1F4", paddingTop: 12 }}>
        {step > 0 && <button className="btn btn-ghost" disabled={busy} onClick={() => setStep(step - 1)}><span aria-hidden="true">‹</span> Retour</button>}
        <span style={{ flex: 1 }} />
        {step < 4 && <button className="btn btn-dark" disabled={!canNext || busy} onClick={() => setStep(step + 1)}>{step === 3 && !archived ? "Télécharge d'abord l'archive" : "Continuer"} <span aria-hidden="true">›</span></button>}
      </div>}
    </div>
  </div>, document.body);
}
