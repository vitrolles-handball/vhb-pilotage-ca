// Étape 5 — Fiche joueur et assiduité de toutes les équipes.
import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { printReleve } from "./Primes.jsx";
import { useBackClose } from "./Comms.jsx";
export { useBackClose };
import { db, f, RED, YELLOW, BLACK, TEXT, MUT, BORDER, OK } from "./App.jsx";

export const POSTES = ["Gardien", "Ailier gauche", "Arrière gauche", "Demi-centre", "Arrière droit", "Ailier droit", "Pivot"];
export const GbChip = () => <span title="Gardien de but" style={{ fontSize: 11, fontWeight: 800, padding: "2px 7px", borderRadius: 8, background: BLACK, color: "#fff", marginLeft: 8, verticalAlign: "2px", letterSpacing: ".04em" }}>GB</span>;

const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const MOIS_LONG = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const mShort = (m) => MOIS[Number(String(m).slice(5, 7)) - 1];
const mLong = (m) => MOIS_LONG[Number(String(m).slice(5, 7)) - 1] + " " + String(m).slice(0, 4);
const shiftMonth = (m, n) => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7); };
const thisMonth = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); };
const pct = (x) => x == null ? "—" : Math.round(x * 100) + " %";
const eur = (n) => (Number(n) || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const fmtDate = (iso) => iso ? new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }) : "";
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const rateTone = (x) => x == null ? "#C9CCD2" : x >= 0.8 ? OK : x >= 0.6 ? "#E8A400" : RED;

async function api(payload) {
  const r = await fetch("/api/joueur", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) window.dispatchEvent(new Event("vhb-auth-lost"));
  if (!r.ok) throw new Error(j.error || "Erreur " + r.status);
  return j;
}
const Chip = ({ children, bg, fg }) => <span style={{ fontSize: 11.5, fontWeight: 800, padding: "4px 9px", borderRadius: 10, background: bg || "#EEF0F3", color: fg || "#3A3F47", whiteSpace: "nowrap" }}>{children}</span>;
const ETAT = { "Présent": ["#E7F4EA", "#1F5C30"], "Excusé": ["#E3EEFB", "#1B4F9B"], "Absent": ["#FDECEC", "#9E1B1B"] };

// ---------------------------------------------------------------------------- Fiche joueur (page entière)
// Le bouton « retour » du téléphone ferme la page du dessus (au lieu de quitter l'appli).
const PAY_TONE = { "Provisoire": ["#E3EEFB", "#1B5E9B"], "Validé": ["#FFF3C4", "#6B4A00"], "Mis en paiement": ["#FDEBD3", "#8A4B00"], "Payé": ["#E2F3E6", "#1F5C30"] };
const capit = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const MOIS_CAP = (m) => capit(MOIS_LONG[Number(String(m).slice(5, 7)) - 1]);
const shortFr = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

export function PlayerCard({ joueurId, teamId, backLabel, onClose, onPoste }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [tid, setTid] = useState(teamId || null);
  const [detail, setDetail] = useState(false);
  const back = useBackClose(onClose);
  const [poste, setPoste] = useState("");
  const [posteBusy, setPosteBusy] = useState(false);
  useEffect(() => { if (d) setPoste(d.joueur.poste || ""); }, [d]);
  const savePoste = async (v) => {
    const old = poste; setPoste(v); setPosteBusy(true);
    try { await db({ action: "update", table: "Joueurs", recordId: joueurId, fields: { "Poste": v || null } }); if (onPoste) onPoste(joueurId, v); }
    catch (e) { setPoste(old); alert(e.message); }
    setPosteBusy(false);
  };
  useEffect(() => { api({ action: "fiche", joueurId }).then((x) => (x && x.joueur ? setD(x) : setErr("Fiche indisponible pour le moment."))).catch((e) => setErr(e.message)); }, [joueurId]);
  useEffect(() => { const o = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = o; }; }, []);
  const teams = (d && d.teams) || [];
  const t = teams.find((x) => x.teamId === tid) || teams[0];
  const initials = d ? ((d.joueur.prenom[0] || "") + (d.joueur.nom[0] || "")).toUpperCase() : "";
  const label = backLabel || (t ? "Effectif " + t.nom : "Retour");
  // Indicateurs de la saison
  const tot = t ? t.months.reduce((a, m) => ({ s: a.s + m.seances, p: a.p + m.presences, tp: a.tp + (m.teamPres || 0), tt: a.tt + (m.teamTot || 0), v: a.v + (m.victoires || 0), m: a.m + (m.matchs || 0), mt: a.mt + (m.matchsTot || 0), e: a.e + (m.entrainements || 0), et: a.et + (m.entrTot || 0), x: a.x + (m.excuses || 0) }), { s: 0, p: 0, tp: 0, tt: 0, v: 0, m: 0, mt: 0, e: 0, et: 0, x: 0 }) : null;
  const seasonRate = tot && tot.s ? tot.p / tot.s : null, teamRate = tot && tot.tt ? tot.tp / tot.tt : null;
  // Mois affichés : du premier mois avec séance (septembre par défaut) au mois en cours, puis le mois suivant à venir.
  const cur = d ? String(d.today || new Date().toISOString()).slice(0, 7) : "";
  const bars = (() => {
    if (!t) return [];
    const withS = t.months.filter((m) => m.seances);
    const sept = d.saison.slice(0, 4) + "-09";
    const start = withS.length ? withS[0].month : (cur < sept ? cur : sept);
    const list = t.months.filter((m) => m.month >= start && m.month <= cur);
    return list.slice(-5).concat([{ month: shiftMonth(cur, 1), future: true }]);
  })();
  const cur10 = d ? d.recent.filter((s) => !t || !s.teamId || s.teamId === t.teamId).slice(0, 10).reverse() : [];
  const recentT = d ? d.recent.filter((s) => !t || !s.teamId || s.teamId === t.teamId) : [];
  const streak = (() => { let n = 0; for (const s of recentT) { if (s.etat === "Présent") n++; else break; } return n; })();
  const lastAbs = (recentT.find((s) => s.etat !== "Présent") || {}).date || null;
  const motifs = t ? Object.entries(t.months.flatMap((m) => m.motifs || []).reduce((o, x) => { const k = x || "Non précisé"; o[k] = (o[k] || 0) + 1; return o; }, {})).sort((a, b) => b[1] - a[1]) : [];
  const trend = (() => { if (!t) return null; const ms = t.months.filter((m) => m.seances > 0); if (ms.length < 2) return null; const a = ms[ms.length - 2], b = ms[ms.length - 1]; return { pts: Math.round((b.taux - a.taux) * 100), from: a.month }; })();
  const eff = t ? t.effectifs[t.effectifs.length - 1] : null;
  const renfort = eff && eff.statut === "Renfort";
  const mois = d && d.mois ? d.mois.filter((m) => !t || teams.length < 2 || m.equipe === t.nom) : null;
  const card = { background: "#fff", borderRadius: 20, padding: "16px 16px", boxShadow: "0 1px 3px rgba(20,22,30,.06)" };
  const H = ({ children, right }) => <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}><div style={{ fontSize: 16, fontWeight: 800, color: TEXT, flex: 1 }}>{children}</div>{right}</div>;

  return createPortal(<div role="dialog" aria-modal="true" aria-label="Fiche joueur" style={{ position: "fixed", inset: 0, zIndex: 210, background: "#F2F3F6", overflowY: "auto", WebkitOverflowScrolling: "touch" }} className="fade">
    <div style={{ backgroundColor: "#E8590C", backgroundImage: "linear-gradient(rgba(28,10,0,.18), rgba(28,10,0,.34)), url(/accent.jpg)", backgroundSize: "cover", backgroundPosition: "center", color: "#fff", padding: "calc(10px + env(safe-area-inset-top)) 16px 26px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <button onClick={back} aria-label={"Retour · " + label} style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "none", border: "none", color: "#fff", fontFamily: "inherit", fontSize: 15, fontWeight: 800, cursor: "pointer", padding: "8px 4px", minHeight: 44 }}><i className="ti ti-chevron-left" aria-hidden="true" style={{ fontSize: 22 }} />{label}</button>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 8 }}>
          <span style={{ width: 72, height: 72, borderRadius: 36, background: "#fff", color: "#C2261B", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 24, flex: "0 0 auto", boxShadow: "0 4px 14px rgba(0,0,0,.18)" }}>{initials || "…"}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.15 }}>{d ? d.joueur.prenom + " " + d.joueur.nom : "Chargement…"}</div>
            {eff && <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              <span style={{ background: "#fff", color: renfort ? "#B5660A" : "#1F5C30", fontSize: 13, fontWeight: 800, padding: "4px 11px", borderRadius: 12 }}>{eff.statut}</span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{eff.entree ? "dans l'effectif depuis le " + shortFr(eff.entree) : "dans l'effectif " + d.saison}{eff.sortie ? " · jusqu'au " + shortFr(eff.sortie) : ""}</span>
            </div>}
            {d && (d.canEditPoste ? <label style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 13.5, fontWeight: 700 }}>Poste
                <select aria-label="Poste du joueur" value={poste} disabled={posteBusy} onChange={(e) => savePoste(e.target.value)} style={{ minHeight: 34, borderRadius: 12, border: "none", padding: "0 10px", fontFamily: "inherit", fontSize: 13.5, fontWeight: 800, color: BLACK, background: "#fff", cursor: "pointer" }}>
                  <option value="">Non renseigné</option>{POSTES.map((x) => <option key={x} value={x}>{x === "Gardien" ? "Gardien (GB)" : x}</option>)}
                </select></label>
              : poste ? <div style={{ marginTop: 8 }}><span style={{ background: "rgba(255,255,255,.18)", fontSize: 13, fontWeight: 800, padding: "4px 11px", borderRadius: 12 }}>{poste === "Gardien" ? "Gardien (GB)" : poste}</span></div> : null)}
            {d && (d.joueur.annee || d.joueur.licence) && <div style={{ fontSize: 12.5, opacity: .85, marginTop: 6 }}>{[d.joueur.annee ? "Né en " + d.joueur.annee : null, d.joueur.licence ? "Licence " + d.joueur.licence : null].filter(Boolean).join(" · ")}</div>}
          </div>
        </div>
      </div>
    </div>
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "14px 12px calc(40px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 12 }}>
      {err && <div style={{ ...card, color: "#9E1B1B" }}>{err}</div>}
      {!d && !err && <div style={{ ...card, color: MUT }}>Chargement de la fiche…</div>}
      {d && <>
        {teams.length > 1 && <div role="group" aria-label="Équipe" style={{ display: "inline-flex", gap: 4, background: "#E6E8EC", borderRadius: 30, padding: 4, alignSelf: "flex-start", flexWrap: "wrap" }}>
          {teams.map((x) => <button key={x.teamId} aria-pressed={x.teamId === t.teamId} onClick={() => setTid(x.teamId)} style={{ minHeight: 36, padding: "0 14px", border: "none", borderRadius: 30, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 800, background: x.teamId === t.teamId ? BLACK : "transparent", color: x.teamId === t.teamId ? "#fff" : "#3A3F47" }}>{x.nom}</button>)}
        </div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
          {[["Assiduité saison", pct(seasonRate), "#1F5C30"], ["Moy. équipe", pct(teamRate), "#6B7079"], ["Présent de suite", streak ? String(streak) + (streak >= 20 ? "+" : "") : "0", TEXT]].map(([l, v, c]) => <div key={l} style={{ ...card, padding: "14px 14px" }}>
            <div style={{ fontSize: 13, color: "#3A3F47", fontWeight: 600 }}>{l}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: c, marginTop: 4, whiteSpace: "nowrap" }}>{v}</div>
            {l === "Assiduité saison" && trend && <div title={"Mois en cours comparé à " + mLong(trend.from)} style={{ fontSize: 12, fontWeight: 800, marginTop: 2, color: trend.pts > 0 ? "#1F5C30" : trend.pts < 0 ? "#9E1B1B" : MUT }}>{trend.pts > 0 ? "↗ +" + trend.pts : trend.pts < 0 ? "↘ " + trend.pts : "→ stable"}{trend.pts ? " pts" : ""} <span style={{ fontWeight: 600, color: MUT }}>vs {mShort(trend.from)}</span></div>}
          </div>)}
        </div>

        {tot && <div style={card}>
          <H>Bilan de la saison</H>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            {[["ti-ball-football", "#F2C318", "#111", "Matchs joués", tot.m + (tot.mt ? " / " + tot.mt : ""), tot.mt ? "sur la feuille de " + Math.round(tot.m / tot.mt * 100) + " % des matchs" : "aucun match pointé"],
              ["ti-trophy", "#F2C318", "#111", "Victoires", String(tot.v), tot.m ? "sur " + tot.m + " match" + (tot.m > 1 ? "s" : "") + " joué" + (tot.m > 1 ? "s" : "") : "—"],
              ["ti-run", "#2E7D46", "#fff", "Entraînements", tot.e + (tot.et ? " / " + tot.et : ""), tot.et ? Math.round(tot.e / tot.et * 100) + " % de présence" : "aucun pointé"],
              ["ti-x", "#D93B30", "#fff", "Absences", String(Math.max(0, tot.s - tot.p)), (tot.x ? "dont " + tot.x + " excusée" + (tot.x > 1 ? "s" : "") + " · " : "") + (lastAbs ? "dernière le " + shortFr(lastAbs) : "aucune récente")]].map(([ic, bg, fg, l, v, sub]) => <div key={l} style={{ display: "flex", gap: 10, alignItems: "center", background: "#F7F8FA", borderRadius: 14, padding: "10px 12px" }}>
              <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 10, background: bg, color: fg, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}><i className={"ti " + ic} style={{ fontSize: 18 }} /></span>
              <span style={{ minWidth: 0 }}><span style={{ display: "block", fontSize: 12.5, color: "#3A3F47", fontWeight: 600 }}>{l}</span><span style={{ display: "block", fontSize: 19, fontWeight: 800, color: TEXT }}>{v}</span><span style={{ display: "block", fontSize: 11.5, color: MUT }}>{sub}</span></span>
            </div>)}
          </div>
          {motifs.length > 0 && <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: "#1B4F9B", marginBottom: 6 }}>Motifs des absences excusées</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{motifs.map(([k, n]) => <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#E3EEFB", color: "#1B4F9B", borderRadius: 20, padding: "5px 11px", fontSize: 12.5, fontWeight: 700 }}>{k}<b style={{ background: "#2F6FD6", color: "#fff", borderRadius: 10, padding: "0 7px", fontSize: 11.5 }}>{n}</b></span>)}</div>
          </div>}
        </div>}

        <div style={card}>
          <H right={<span style={{ fontSize: 12.5, color: MUT, display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 18, borderTop: "2px dashed #6B7079" }} />moyenne équipe</span>}>Assiduité par mois</H>
          <div role="img" aria-label={"Assiduité par mois" + (teamRate != null ? ", moyenne de l'équipe " + pct(teamRate) : "")} style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(" + bars.length + ", minmax(0, 1fr))", gap: 14, alignItems: "end", height: 170, padding: "0 4px" }}>
            {teamRate != null && <div aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, bottom: "calc(26px + " + (teamRate * 118) + "px)", borderTop: "2px dashed #6B7079", zIndex: 2 }} />}
            {bars.map((m) => { const has = !m.future && m.seances > 0; const isCur = m.month === cur; return <div key={m.month} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", gap: 6 }} title={has ? m.presences + " présence(s) sur " + m.seances + " séance(s)" + (m.moyenne != null ? " · équipe " + pct(m.moyenne) : "") : ""}>
              <span style={{ fontSize: 13, fontWeight: 800, color: has ? TEXT : "#B8BDC4" }}>{has ? pct(m.taux) : "–"}</span>
              <div style={{ width: "100%", maxWidth: 58, height: has ? Math.max(6, m.taux * 118) : 6, borderRadius: "10px 10px 4px 4px", background: has ? (isCur ? "#9CCFAA" : "#2E7D46") : "#ECEEF1" }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: "#3A3F47", height: 18 }}>{capit(mShort(m.month))}</span>
            </div>; })}
          </div>
          {!t.months.some((m) => m.seances) && <div style={{ fontSize: 13, color: MUT, marginTop: 8 }}>Aucune séance pointée pour l'instant : le graphique se remplira au fil des pointages.</div>}
        </div>

        <div style={card}>
          <H>{cur10.length >= 10 ? "10 dernières séances" : "Dernières séances"}</H>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(10, minmax(0, 46px))", gap: 7 }}>
            {Array.from({ length: 10 }).map((_, i) => { const s = cur10[i]; if (!s) return <span key={i} style={{ aspectRatio: "1", borderRadius: 9, border: "2px dashed #E2E5E9" }} />;
              const match = s.type === "Match", pres = s.etat === "Présent";
              const bg = pres ? (match ? "#F2C318" : "#2E7D46") : s.etat === "Excusé" ? "#2F6FD6" : "#D93B30";
              return <span key={s.id} title={fmtDate(s.date) + " · " + (match ? "Match" + (s.adversaire ? " vs " + s.adversaire : "") + (s.score ? " · " + s.score : "") : s.type) + " · " + s.etat} aria-label={fmtDate(s.date) + " " + s.type + " " + s.etat} style={{ aspectRatio: "1", borderRadius: 9, background: bg, border: "none", display: "flex", alignItems: "center", justifyContent: "center", color: match && pres ? "#111" : "#fff", fontWeight: 800, fontSize: 15 }}>{pres ? (match && s.resultat === "Victoire" ? "V" : "✓") : s.etat === "Excusé" ? "E" : "✕"}</span>; })}
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 12, fontSize: 12.5, color: "#3A3F47" }}>
            {[["#2E7D46", "Entraînement"], ["#F2C318", "Match joué"], ["#D93B30", "Absent"], ["#2F6FD6", "Excusé"]].map(([c, l]) => <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 4, background: c, border: c === "#E2E5E9" ? "1px solid #C9CDD3" : "none" }} />{l}</span>)}
          </div>
          {!cur10.length && <div style={{ fontSize: 13, color: MUT, marginTop: 8 }}>Aucune séance pointée pour l'instant.</div>}
        </div>

        {mois && <div style={card}>
          <H right={t && t.primes && <button className="btn btn-ghost" style={{ minHeight: 34, padding: "0 10px", fontSize: 12.5 }} onClick={async () => {
            const w = window.open("", "_blank");
            if (w) w.document.write("<p style='font-family:Arial;margin:24px'>Préparation du relevé…</p>");
            try {
              const r = await fetch("/api/primes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "annual", teamId: t.teamId, season: Number(d.saison.slice(0, 4)) }) });
              const j = await r.json(); if (!r.ok) throw new Error(j.error || "Erreur");
              const pl = j.players.filter((x) => x.joueur === joueurId);
              if (!pl.length) { if (w) w.close(); alert("Aucune prime validée cette saison pour ce joueur."); return; }
              if (w) { w.document.open(); }
              printReleve({ team: j.team.nom, season: j.season, players: pl, months: j.months, win: w });
            } catch (e) { if (w) w.close(); alert(e.message); }
          }}><i className="ti ti-printer" aria-hidden="true" />Relevé annuel</button>}>Primes</H>
          {!mois.length && <div style={{ fontSize: 13, color: MUT }}>Pas encore de prime sur cette saison.</div>}
          {mois.map((m, i) => { const tone = PAY_TONE[m.statut] || PAY_TONE["Validé"]; return <div key={m.periode + m.equipe} style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 2px", borderTop: i ? "1px solid #EEF0F3" : "none" }}>
            <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: TEXT }}>{MOIS_CAP(m.periode)}{teams.length > 1 && teams.filter((x) => x.primes).length > 1 ? <span style={{ color: MUT, fontWeight: 500 }}> · {m.equipe}</span> : null}</span>
            <span style={{ fontSize: 12.5, fontWeight: 800, padding: "4px 11px", borderRadius: 12, background: tone[0], color: tone[1] }}>{m.statut}</span>
            <b style={{ minWidth: 84, textAlign: "right", fontSize: 15.5, color: m.montant < 0 ? "#9E1B1B" : TEXT }}>{eur(m.montant)}</b>
          </div>; })}
          {d.primes && d.primes.length > 0 && <button onClick={() => setDetail(!detail)} style={{ marginTop: 6, background: "none", border: "none", padding: "6px 0", color: "#1B5E9B", textDecoration: "underline", cursor: "pointer", font: "inherit", fontSize: 13 }}>{detail ? "Masquer le détail" : "Voir le détail des lignes (régularisations, primes exceptionnelles)"}</button>}
          {detail && d.primes.map((l) => <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: "#F7F8FA", borderRadius: 10, marginTop: 4, fontSize: 13 }}>
            <span style={{ flex: 1 }}><b>{MOIS_CAP(l.periode)}</b> · {l.type}{l.motif ? " · " + l.motif : ""}</span>
            <b style={{ color: l.montant < 0 ? "#9E1B1B" : TEXT }}>{eur(l.montant)}</b>
            <Chip>{l.valide ? l.paiement : "Mois ouvert"}</Chip>
          </div>)}
        </div>}
      </>}
    </div>
  </div>, document.body);
}

// ---------------------------------------------------------------------------- Onglet Joueurs (toutes les équipes)
// Joueurs ajoutés depuis une séance par un coach : à passer en Effectif ou à garder en renfort.
function PendingPlayers({ rows, onDone }) {
  const [busy, setBusy] = useState(null);
  if (!rows.length) return null;
  const decide = async (r, statut) => {
    setBusy(r.ef);
    try { await db({ action: "update", table: "Effectifs", recordId: r.ef, fields: { "Statut": statut, "À valider": false } }); onDone(r.ef, statut); }
    catch (e) { alert("Impossible : " + e.message); }
    setBusy(null);
  };
  return <div className="card" style={{ borderLeft: "4px solid #E8800C", background: "#FFF8EF", display: "flex", flexDirection: "column", gap: 10 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}><i className="ti ti-flag" aria-hidden="true" style={{ color: "#E8800C", fontSize: 18 }} /><b style={{ fontSize: 14.5 }}>{rows.length === 1 ? "1 joueur ajouté depuis une séance, à valider" : rows.length + " joueurs ajoutés depuis une séance, à valider"}</b></div>
    {rows.map((r) => <div key={r.ef} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", background: "#fff", borderRadius: 12, padding: "8px 10px" }}>
      <span style={{ flex: "1 1 150px", minWidth: 0 }}><b>{r.nom}</b><span style={{ display: "block", fontSize: 12, color: MUT }}>En renfort{r.entree ? " depuis le " + new Date(r.entree + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : ""}</span></span>
      <button className="btn btn-dark" disabled={busy === r.ef} onClick={() => decide(r, "Effectif")} style={{ minHeight: 36, fontSize: 13 }}><i className="ti ti-check" aria-hidden="true" />Passer en Effectif</button>
      <button className="btn btn-ghost" disabled={busy === r.ef} onClick={() => decide(r, "Renfort")} style={{ minHeight: 36, fontSize: 13 }}>Garder en renfort</button>
    </div>)}
  </div>;
}

export function RosterView({ teams, efx, players, initialTeam, onManage, canValidate, onValidated }) {
  const [teamId, setTeamId] = useState(() => initialTeam || (teams[0] || {}).id);
  const [month, setMonth] = useState(thisMonth);
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("nom");
  const [open, setOpen] = useState(null);
  const [posteOv, setPosteOv] = useState({});
  const [validated, setValidated] = useState({});
  const load = useCallback(async () => {
    if (!teamId) return; setErr(""); setData(null);
    try { setData(await api({ action: "assiduite", teamId, month })); } catch (e) { setErr(e.message); }
  }, [teamId, month]);
  useEffect(() => { load(); }, [load]);
  if (!teams.length) return <div className="card" style={{ color: MUT }}>Aucune équipe.</div>;
  // Effectif actuel de l'équipe (même les joueurs sans séance ce mois-ci).
  const today = new Date().toISOString().slice(0, 10);
  const roster = efx.filter((e) => (f(e, "Équipe") || []).includes(teamId) && (!f(e, "Sortie") || f(e, "Sortie") >= month + "-01"))
    .map((e) => { const p = players.find((x) => x.id === (f(e, "Joueur") || [])[0]); return p && { id: p.id, nom: ((f(p, "Prénom") || "") + " " + (f(p, "Nom") || "")).trim(), tri: norm(f(p, "Nom")) + " " + norm(f(p, "Prénom")), statut: f(e, "Statut") || "Effectif", poste: posteOv[p.id] !== undefined ? posteOv[p.id] : (f(p, "Poste") || ""), futur: f(e, "Entrée") && f(e, "Entrée") > today, ef: e.id, aValider: !!f(e, "À valider"), entree: f(e, "Entrée") || "" }; })
    .filter(Boolean);
  const seen = new Set(); const rows = roster.filter((r) => !seen.has(r.id) && seen.add(r.id))
    .map((r) => ({ ...r, a: data && (data.lines || []).find((l) => l.joueur === r.id) }))
    .filter((r) => !q || norm(r.nom).includes(norm(q)))
    .sort((x, y) => sort === "taux" ? ((x.a ? x.a.taux : -1) - (y.a ? y.a.taux : -1)) : x.tri.localeCompare(y.tri, "fr"));
  const c = data && data.counters;
  return <div className="fade" style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 820 }}>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      {teams.length > 1 && <select className="sel" aria-label="Équipe" value={teamId} onChange={(e) => setTeamId(e.target.value)} style={{ width: "auto", minWidth: 140 }}>{teams.map((t) => <option key={t.id} value={t.id}>{f(t, "Nom")}</option>)}</select>}
      <div role="group" aria-label="Mois" style={{ display: "flex", alignItems: "center", gap: 4, background: "#E9EBEF", borderRadius: 30, padding: 4 }}>
        <button aria-label="Mois précédent" className="btn btn-ghost" style={{ minHeight: 36, padding: "0 10px", borderRadius: 30 }} onClick={() => setMonth(shiftMonth(month, -1))}><span aria-hidden="true" style={{ fontSize: 20 }}>‹</span></button>
        <span style={{ fontWeight: 800, fontSize: 14.5, minWidth: 120, textAlign: "center", textTransform: "capitalize" }}>{mLong(month)}</span>
        <button aria-label="Mois suivant" className="btn btn-ghost" style={{ minHeight: 36, padding: "0 10px", borderRadius: 30 }} onClick={() => setMonth(shiftMonth(month, 1))}><span aria-hidden="true" style={{ fontSize: 20 }}>›</span></button>
      </div>
      {onManage && <button className="btn btn-dark" style={{ marginLeft: "auto" }} onClick={() => onManage(teamId, "joueurs")}><i className="ti ti-user-plus" aria-hidden="true" />Ajouter ou modifier des joueurs</button>}
    </div>
    {c && <div className="card" style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", padding: "12px 14px", fontSize: 13.5 }}>
      <span><b>{c.entrainements}</b> entraînement(s)</span><span><b>{c.matchs}</b> match(s)</span><span><b>{c.annulees}</b> annulée(s)</span>
      {(c.enRetard ?? c.aPointer) > 0 && <span style={{ color: "#9E1B1B", fontWeight: 800 }}>{c.enRetard ?? c.aPointer} à pointer</span>}
      {c.aVenir > 0 && <span style={{ color: MUT }}>{c.aVenir} à venir</span>}
      <span style={{ marginLeft: "auto" }}>Présence moyenne : <b>{c.comptees ? pct(data.tauxMoyen) : "—"}</b></span>
    </div>}
    {err && <div className="card" style={{ color: "#9E1B1B" }}>{err}</div>}
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <input className="inp" aria-label="Rechercher un joueur" placeholder="Rechercher un joueur…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: "1 1 180px", width: "auto", minWidth: 0 }} />
      <select className="sel" aria-label="Trier" value={sort} onChange={(e) => setSort(e.target.value)} style={{ width: "auto", flex: "0 0 auto" }}><option value="nom">Par nom</option><option value="taux">Moins présents</option></select>
    </div>
    {canValidate && <PendingPlayers rows={roster.filter((r) => r.aValider && !(validated[r.ef]))} onDone={(ef, label) => { setValidated((o) => ({ ...o, [ef]: label })); onValidated && onValidated(); }} />}
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {[["Effectif", OK, rows.filter((r) => r.statut !== "Renfort")], ["Renforts", "#E8800C", rows.filter((r) => r.statut === "Renfort")]].filter((g) => g[2].length).map(([label, col, list], gi) => <React.Fragment key={label}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: gi ? "10px 2px 0" : "2px 2px 0" }}><span style={{ width: 4, height: 14, borderRadius: 2, background: col }} /><b style={{ fontSize: 14 }}>{label}</b><span style={{ fontSize: 12.5, color: MUT }}>{list.length} joueur{list.length > 1 ? "s" : ""}</span></div>
      {list.map((r) => <button key={r.id} className="card" onClick={() => setOpen(r.id)} style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left", border: "none", borderLeft: "4px solid " + (r.statut === "Renfort" ? "#E8800C" : OK), cursor: "pointer", fontFamily: "inherit", padding: "12px 14px" }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontWeight: 800, fontSize: 15 }}>{r.nom}{r.poste === "Gardien" && <GbChip />}</span>
          <span style={{ display: "block", fontSize: 12.5, color: MUT }}><b style={{ color: r.statut === "Renfort" ? "#B5660A" : "#1F5C30", fontWeight: 700 }}>{r.statut}</b>{r.futur ? " · arrive bientôt" : ""}{r.a ? " · " + r.a.presences + "/" + r.a.seances + " séances" + (r.a.excuses ? " · " + r.a.excuses + " excusée(s)" : "") : data ? " · pas de séance ce mois-ci" : ""}</span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 64, height: 8, borderRadius: 4, background: "#EEF0F3", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: (r.a && r.a.seances ? r.a.taux * 100 : 0) + "%", background: rateTone(r.a && r.a.seances ? r.a.taux : null) }} /></span>
          <b style={{ minWidth: 44, textAlign: "right" }}>{r.a && r.a.seances ? pct(r.a.taux) : "—"}</b>
        </span>
      </button>)}
      </React.Fragment>)}
      {!rows.length && <div className="card" style={{ color: MUT }}>{q ? "Aucun joueur ne correspond." : "Aucun joueur dans cette équipe." + (onManage ? " Ajoute-les avec « Ajouter ou modifier des joueurs »." : "")}</div>}
    </div>
    <div style={{ fontSize: 12.5, color: MUT }}>Touche un joueur pour ouvrir sa fiche : assiduité de la saison, dernières séances{" "}et primes pour les personnes qui y ont accès.</div>
    {open && <PlayerCard joueurId={open} teamId={teamId} backLabel={"Effectif " + (f(teams.find((t) => t.id === teamId), "Nom") || "")} onClose={() => setOpen(null)} onPoste={(id, v) => setPosteOv((o) => ({ ...o, [id]: v }))} />}
  </div>;
}
