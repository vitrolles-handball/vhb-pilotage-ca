// Étape 4 — Primes : tableau du mois (directeur sportif), corrections, validation, paiements (comptabilité).
// Les calculs et toutes les écritures se font côté serveur (/api/primes) ; ici on affiche et on envoie.
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { PlayerCard } from "./Fiche.jsx";
import { db, dbForget, f, RED, YELLOW, BLACK, TEXT, MUT, BORDER, OK } from "./App.jsx";

const has = (rights, r) => (rights || []).includes("*") || (rights || []).includes(r);
export const PRIMES_RIGHTS = ["corr", "valid", "param", "compta"];
export const hasPrimes = (rights) => PRIMES_RIGHTS.some((r) => has(rights, r));
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const eur = (n) => (Number(n) || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const pct = (x) => (Math.round((Number(x) || 0) * 1000) / 10).toLocaleString("fr-FR") + " %";
function useNarrow() {
  const q = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(max-width: 700px)") : null;
  const [n, setN] = useState(q ? q.matches : false);
  useEffect(() => { if (!q) return; const h = () => setN(q.matches); q.addEventListener ? q.addEventListener("change", h) : q.addListener(h); return () => { q.removeEventListener ? q.removeEventListener("change", h) : q.removeListener(h); }; }, []);
  return n;
}
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const monthLabel = (m) => { const [y, mo] = String(m).split("-").map(Number); return MOIS[mo - 1] + " " + y; };
const shiftMonth = (m, n) => { const [y, mo] = m.split("-").map(Number); const d = new Date(Date.UTC(y, mo - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const todayIso = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const defaultMonth = () => { const t = todayIso(); return Number(t.slice(8)) <= 10 ? shiftMonth(t.slice(0, 7), -1) : t.slice(0, 7); };
const fmtDate = (iso) => { if (!iso) return ""; const d = new Date(String(iso).length <= 10 ? iso + "T12:00:00" : iso); return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }); };
const fmtDT = (iso) => iso ? new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

async function primesApi(payload) {
  const r = await fetch("/api/primes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) window.dispatchEvent(new Event("vhb-auth-lost"));
  if (!r.ok) { const e = new Error(j.error || "Erreur " + r.status); e.body = j; throw e; }
  ["Primes – Lignes", "Primes – Mois", "Pointages", "Séances"].forEach((t) => dbForget(t));
  return j;
}
// Export lisible par Excel (séparateur « ; », virgule décimale, accents conservés).
function downloadCsv(name, rows) {
  const cell = (v) => { const s = typeof v === "number" ? String(v).replace(".", ",") : String(v ?? ""); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const blob = new Blob(["﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

// Fenêtre avec croix de fermeture en haut à droite et touche Échap.
function Sheet({ title, onClose, children, wide }) {
  useEffect(() => { const h = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);
  return createPortal(<div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, background: "rgba(16,17,20,.55)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 12 }}>
    <div className="card" style={{ position: "relative", width: "100%", maxWidth: wide ? 760 : 520, maxHeight: "88vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, marginBottom: "env(safe-area-inset-bottom)" }}>
      <div style={{ position: "sticky", top: 0, alignSelf: "flex-end", height: 0, zIndex: 3 }}><button aria-label="Fermer" onClick={onClose} style={{ position: "relative", top: -4, right: -6, boxShadow: "0 2px 8px rgba(0,0,0,.12)", width: 40, height: 40, borderRadius: 20, border: "none", background: "#EEF0F3", cursor: "pointer", fontSize: 20, lineHeight: 1 }}><i className="ti ti-x" aria-hidden="true" />{"×".slice(0, 0)}</button></div>
      <div style={{ fontSize: 18, fontWeight: 800, color: TEXT, paddingRight: 48 }}>{title}</div>
      {children}
    </div>
  </div>, document.body);
}
const Stat = ({ label, value, tone }) => <div className="card" style={{ flex: "1 1 120px", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 2, borderLeft: "4px solid " + (tone || BORDER) }}>
  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".06em", color: MUT }}>{label}</span><span style={{ fontSize: 22, fontWeight: 800, color: TEXT }}>{value}</span></div>;
const Chip = ({ children, bg, fg }) => <span style={{ fontSize: 11.5, fontWeight: 800, padding: "4px 9px", borderRadius: 10, background: bg || "#EEF0F3", color: fg || "#3A3F47", whiteSpace: "nowrap" }}>{children}</span>;
const PAY_TONE = { "À payer": ["#FDECEC", "#9E1B1B"], "Mis en paiement": ["#FFF6D6", "#6B4A00"], "Payé": ["#E7F4EA", "#1F5C30"] };

// =====================================================================================
// Tableau du mois
// =====================================================================================
export function PrimesView({ rights, teams, users, initialTeam }) {
  const primeTeams = useMemo(() => (teams || []).filter((t) => f(t, "Primes actives")).concat((teams || []).filter((t) => !f(t, "Primes actives"))), [teams]);
  const [teamId, setTeamId] = useState(() => initialTeam || (primeTeams[0] || {}).id);
  const [month, setMonth] = useState(defaultMonth);
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState(null);   // ligne joueur
  const [extra, setExtra] = useState(null);     // { joueurId? }
  const canCorr = has(rights, "corr"), canValid = has(rights, "valid");
  const narrow = useNarrow();
  const [ref, setRef] = useState({ users: users || [], players: [] });
  useEffect(() => { Promise.all([db({ action: "list", table: "Utilisateurs" }), db({ action: "list", table: "Joueurs" })]).then(([u, p]) => setRef({ users: u.records || [], players: p.records || [] })).catch(() => {}); }, []);
  const team = primeTeams.find((t) => t.id === teamId);
  const load = useCallback(async () => {
    if (!teamId) return;
    setErr(""); setData(null);
    try { setData(await primesApi({ action: "month", teamId, month })); } catch (e) { setErr(e.message); }
  }, [teamId, month]);
  useEffect(() => { load(); }, [load]);
  const pNameOf = (id) => { const p = ref.players.find((x) => x.id === id); return p ? ((f(p, "Prénom") || "") + " " + (f(p, "Nom") || "")).trim() : null; };
  const userName = (id) => { const u = (ref.users || []).find((x) => x.id === id); return u ? ((f(u, "Prénom") || "") + " " + (f(u, "Nom") || "")).trim() || f(u, "Email") : ""; };

  if (!primeTeams.length) return <div className="card" style={{ color: MUT }}>Aucune équipe.</div>;
  const validated = data && data.status === "Validé";
  // Lignes uniformisées (calcul en direct ou lignes figées).
  const rows = !data ? [] : validated
    ? (() => {
      const byJ = new Map();
      data.lines.forEach((l) => {
        const j = (l["Joueur"] || [])[0]; if (!byJ.has(j)) byJ.set(j, { joueur: j, nom: pNameOf(j) || (l["Type"] === "Normale" ? String(l["Libellé"] || "").split(" · ").pop() : "") || "Joueur", tri: (() => { const p = ref.players.find((x) => x.id === j); return p ? norm(f(p, "Nom")) + " " + norm(f(p, "Prénom")) : "~"; })(), statut: "—", entrainements: 0, matchs: 0, presences: 0, seances: 0, taux: 0, primePresence: 0, victoires: 0, primeVictoire: 0, extra: 0, total: 0, extras: [], pay: [] });
        const r = byJ.get(j);
        if (l["Type"] === "Normale") Object.assign(r, { statut: l["Statut joueur"] || "Effectif", entrainements: l["Entraînements"] || 0, matchs: l["Matchs"] || 0, presences: l["Présences"] || 0, seances: l["Séances"] || 0, taux: l["Taux"] || 0, primePresence: l["Prime présence"] || 0, victoires: l["Victoires"] || 0, primeVictoire: l["Prime victoire"] || 0 });
        else { r.extra += Number(l["Montant"]) || 0; r.extras.push({ id: l.id, type: l["Type"], montant: l["Montant"], motif: l["Motif"] }); }
        r.total += Number(l["Montant"]) || 0; r.pay.push(l["Paiement"] || "À payer");
      });
      return [...byJ.values()].sort((a, b) => a.tri.localeCompare(b.tri, "fr"));
    })()
    : data.lines || [];
  const totals = validated ? { total: rows.reduce((t, r) => t + r.total, 0) } : (data && data.totals) || {};
  const counters = validated ? (data.detail && data.detail.counters) || {} : (data && data.counters) || {};

  const validate = async () => {
    if (!confirm("Valider " + monthLabel(month) + " pour " + f(team, "Nom") + " ?\n\nTotal : " + eur(totals.total) + "\nLes montants seront figés : une erreur découverte ensuite se corrigera par une régularisation sur un mois suivant.")) return;
    setBusy(true);
    try { const r = await primesApi({ action: "validate", teamId, month }); await load(); alert("Mois validé : " + eur(r.total) + ". La comptabilité peut maintenant le mettre en paiement."); }
    catch (e) { alert(e.message); }
    setBusy(false);
  };
  const exportCsv = () => {
    const head = ["Joueur", "Statut", "Entraînements", "Matchs", "Présences", "Séances", "Taux (%)", "Prime présence", "Victoires", "Prime victoire", "Exceptionnelles / régularisations", "Total"];
    downloadCsv("primes-" + norm(f(team, "Nom")).replace(/[^a-z0-9]+/g, "-") + "-" + month + ".csv", [head].concat(rows.map((r) => [r.nom, r.statut, r.entrainements, r.matchs, r.presences, r.seances, Math.round(r.taux * 1000) / 10, r.primePresence, r.victoires, r.primeVictoire, Math.round(r.extra * 100) / 100, Math.round(r.total * 100) / 100]), [["Total", "", "", "", "", "", "", "", "", "", "", Math.round((totals.total || 0) * 100) / 100]]));
  };

  return (
    <div className="fade" style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 1100 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {primeTeams.length > 1 && <select className="sel" aria-label="Équipe" value={teamId} onChange={(e) => setTeamId(e.target.value)} style={{ width: "auto", minWidth: 150 }}>
          {primeTeams.map((t) => <option key={t.id} value={t.id}>{f(t, "Nom")}{f(t, "Primes actives") ? "" : " (sans primes)"}</option>)}
        </select>}
        <div role="group" aria-label="Mois" style={{ display: "flex", alignItems: "center", gap: 4, background: "#E9EBEF", borderRadius: 30, padding: 4 }}>
          <button aria-label="Mois précédent" className="btn btn-ghost" style={{ minHeight: 36, padding: "0 10px", borderRadius: 30 }} onClick={() => setMonth(shiftMonth(month, -1))}><span aria-hidden="true" style={{ fontSize: 20 }}>‹</span></button>
          <span style={{ fontWeight: 800, fontSize: 14.5, minWidth: 128, textAlign: "center", textTransform: "capitalize" }}>{monthLabel(month)}</span>
          <button aria-label="Mois suivant" className="btn btn-ghost" style={{ minHeight: 36, padding: "0 10px", borderRadius: 30 }} onClick={() => setMonth(shiftMonth(month, 1))}><span aria-hidden="true" style={{ fontSize: 20 }}>›</span></button>
        </div>
        {data && (validated ? <Chip bg="#E7F4EA" fg="#1F5C30">Validé{data.mois && data.mois.valideLe ? " le " + fmtDT(data.mois.valideLe) : ""}{data.mois && data.mois.validePar && userName(data.mois.validePar) ? " par " + userName(data.mois.validePar) : ""}</Chip> : <Chip bg="#FFF6D6" fg="#6B4A00">Ouvert · montants provisoires</Chip>)}
        <span style={{ flex: 1 }} />
        {data && rows.length > 0 && <button className="btn btn-ghost" onClick={exportCsv}><i className="ti ti-file-spreadsheet" aria-hidden="true" />Exporter (Excel)</button>}
      </div>

      {err && <div className="card" style={{ borderLeft: "4px solid " + RED, color: "#9E1B1B" }}>{err}</div>}
      {!data && !err && <div className="card" style={{ color: MUT }}>Calcul en cours…</div>}
      {data && !validated && !data.active && <div className="card" style={{ borderLeft: "4px solid " + YELLOW, fontSize: 13.5, color: "#5C4600" }}>Les primes ne sont pas activées pour cette équipe : le tableau montre l'assiduité seulement. (Admin › Équipes › Modifier, avec le droit « Paramétrer les barèmes ».)</div>}

      {data && <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Stat label="ENTRAÎNEMENTS" value={counters.entrainements ?? 0} tone="#1B5E9B" />
        <Stat label="MATCHS" value={(counters.matchs ?? 0) + (counters.victoires ? " · " + counters.victoires + " V" : "")} tone={RED} />
        <Stat label="ANNULÉES" value={counters.annulees ?? 0} />
        {!validated && <Stat label="À POINTER" value={counters.aPointer ?? 0} tone={counters.aPointer ? RED : OK} />}
        <Stat label={validated ? "TOTAL VALIDÉ" : "TOTAL PROVISOIRE"} value={eur(totals.total)} tone={YELLOW} />
      </div>}

      {data && !validated && data.pending && data.pending.length > 0 && <div className="card" style={{ borderLeft: "4px solid " + RED, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".06em", color: "#9E1B1B" }}>SÉANCES À POINTER AVANT DE VALIDER</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{data.pending.map((s) => <Chip key={s.id} bg="#FDECEC" fg="#9E1B1B">{fmtDate(s.date)} · {s.type}</Chip>)}</div>
        <div style={{ fontSize: 12.5, color: MUT }}>Elles n'entrent pas dans le calcul tant qu'elles ne sont pas pointées (ou annulées).</div>
      </div>}

      {data && narrow && <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((r) => <button key={r.joueur} className="card" onClick={() => setDetail(r)} style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left", border: "none", cursor: "pointer", fontFamily: "inherit", padding: "12px 14px" }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontWeight: 800, fontSize: 15 }}>{r.nom}</span>
            <span style={{ display: "block", fontSize: 12.5, color: MUT }}>{r.presences}/{r.seances} séances · {r.seances ? pct(r.taux) : "—"} · {r.entrainements} entr. · {r.matchs} match(s){r.victoires ? " · " + r.victoires + " V" : ""}</span>
            {r.statut === "Renfort" && <span style={{ display: "block", fontSize: 11.5, fontWeight: 800, color: "#8A6A00" }}>Renfort</span>}
            {r.extra ? <span style={{ display: "block", fontSize: 12, color: r.extra < 0 ? "#9E1B1B" : MUT }}>Autres : {eur(r.extra)}</span> : null}
          </span>
          <span style={{ textAlign: "right" }}><span style={{ display: "block", fontWeight: 800, fontSize: 16 }}>{eur(r.total)}</span>{validated && [...new Set(r.pay)].map((p) => <Chip key={p} bg={(PAY_TONE[p] || [])[0]} fg={(PAY_TONE[p] || [])[1]}>{p}</Chip>)}</span>
        </button>)}
        {!rows.length && <div className="card" style={{ color: MUT }}>Aucun joueur évalué ce mois-ci.</div>}
      </div>}
      {data && !narrow && <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 760 }}>
          <thead><tr style={{ textAlign: "right", color: MUT, fontSize: 11.5, letterSpacing: ".04em" }}>
            {["JOUEUR", "ENTRAÎN.", "MATCHS", "TOTAL", "TAUX", "PRÉSENCE", "VICTOIRES", "AUTRES", "TOTAL €"].concat(validated ? ["PAIEMENT"] : []).map((h, i) => <th key={h} style={{ padding: "12px 10px", textAlign: i === 0 ? "left" : "right", borderBottom: "1px solid " + BORDER, fontWeight: 800 }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((r) => <tr key={r.joueur} onClick={() => setDetail(r)} style={{ cursor: "pointer", borderBottom: "1px solid " + BORDER }}>
              <td style={{ padding: "10px", textAlign: "left" }}><div style={{ fontWeight: 800 }}>{r.nom}</div>{r.statut === "Renfort" && <div style={{ fontSize: 11.5, fontWeight: 800, color: "#8A6A00" }}>Renfort · pas de prime de présence</div>}{r.excuses > 0 && <div style={{ fontSize: 11.5, color: MUT }}>{r.excuses} absence(s) excusée(s)</div>}</td>
              <td style={{ padding: 10, textAlign: "right" }}>{r.entrainements}</td>
              <td style={{ padding: 10, textAlign: "right" }}>{r.matchs}</td>
              <td style={{ padding: 10, textAlign: "right" }}>{r.presences}/{r.seances}</td>
              <td style={{ padding: 10, textAlign: "right" }}>{r.seances ? pct(r.taux) : "—"}</td>
              <td style={{ padding: 10, textAlign: "right" }}>{eur(r.primePresence)}</td>
              <td style={{ padding: 10, textAlign: "right" }}>{r.victoires ? r.victoires + " · " + eur(r.primeVictoire) : "—"}</td>
              <td style={{ padding: 10, textAlign: "right", color: r.extra < 0 ? "#9E1B1B" : TEXT }}>{r.extra ? eur(r.extra) : "—"}</td>
              <td style={{ padding: 10, textAlign: "right", fontWeight: 800 }}>{eur(r.total)}</td>
              {validated && <td style={{ padding: 10, textAlign: "right" }}>{[...new Set(r.pay)].map((p) => <Chip key={p} bg={(PAY_TONE[p] || [])[0]} fg={(PAY_TONE[p] || [])[1]}>{p}</Chip>)}</td>}
            </tr>)}
            {!rows.length && <tr><td colSpan={10} style={{ padding: 16, color: MUT }}>Aucun joueur évalué ce mois-ci (pas de séance pointée, ou effectif vide).</td></tr>}
          </tbody>
          {rows.length > 0 && <tfoot><tr><td style={{ padding: 10, fontWeight: 800 }}>Total</td><td colSpan={4} /><td style={{ padding: 10, textAlign: "right", fontWeight: 800 }}>{validated ? "" : eur(totals.presence)}</td><td style={{ padding: 10, textAlign: "right", fontWeight: 800 }}>{validated ? "" : eur(totals.victoire)}</td><td style={{ padding: 10, textAlign: "right", fontWeight: 800 }}>{validated ? "" : eur(totals.extra)}</td><td style={{ padding: 10, textAlign: "right", fontWeight: 800, fontSize: 15 }}>{eur(totals.total)}</td>{validated && <td />}</tr></tfoot>}
        </table>
      </div>}

      {data && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {canCorr && <button className="btn btn-ghost" onClick={() => setExtra({})}><i className="ti ti-plus" aria-hidden="true" />{validated ? "Régularisation (mois suivant)" : "Prime exceptionnelle ou régularisation"}</button>}
        <span style={{ flex: 1 }} />
        {!validated && canValid && <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <button className="btn btn-red" disabled={busy || !data.canValidate} onClick={validate} style={{ minHeight: 48 }}><i className="ti ti-lock" aria-hidden="true" />Valider le mois · {eur(totals.total)}</button>
          {!data.canValidate && <span style={{ fontSize: 12.5, color: MUT }}>{(data.blockers || []).join(" ")}</span>}
        </div>}
      </div>}
      {data && !validated && <div style={{ fontSize: 12.5, color: MUT, lineHeight: 1.5 }}>Touche un joueur pour voir le détail de ses séances{canCorr ? " et excuser une absence" : ""}. Barème : {eur(data.bareme && data.bareme.presence)} par mois au prorata · {eur(data.bareme && data.bareme.victoire)} par victoire · absence excusée comptée comme {data.bareme && data.bareme.excuse === "Séance non comptée" ? "séance non comptée" : "une absence"}.</div>}

      {detail && <PlayerDetail row={detail} data={data} validated={validated} canCorr={canCorr} onClose={() => setDetail(null)} onChanged={async () => { setDetail(null); await load(); }} onExtra={() => { setExtra({ joueurId: detail.joueur }); setDetail(null); }} />}
      {extra && <ExtraForm teamId={teamId} month={validated ? shiftMonth(month, 1) : month} rows={rows} preset={extra.joueurId} validated={validated} onClose={() => setExtra(null)} onDone={async (m) => { setExtra(null); if (m !== month) setMonth(m); else await load(); }} />}
    </div>
  );
}

function PlayerDetail({ row, data, validated, canCorr, onClose, onChanged, onExtra }) {
  const [busyId, setBusyId] = useState(null);
  const [card, setCard] = useState(false);
  const seances = validated ? [] : (data.seances || []);
  const stOf = (sid) => ((row.detail || []).find((x) => x.s === sid) || {}).st;
  const excuse = async (sid, on) => {
    let motif = "";
    if (on) { motif = prompt("Motif de l'absence excusée (blessure, examen, sélection…) :") || ""; if (!motif.trim()) return; }
    setBusyId(sid);
    try { await primesApi({ action: "excuse", seanceId: sid, joueurId: row.joueur, excused: on, motif }); await onChanged(); } catch (e) { alert(e.message); }
    setBusyId(null);
  };
  const delExtra = async (x) => {
    if (!confirm("Retirer cette ligne (" + eur(x.montant) + " · " + x.motif + ") ?")) return;
    try { await primesApi({ action: "deleteExtra", lineId: x.id }); await onChanged(); } catch (e) { alert(e.message); }
  };
  const TONE = { "Présent": ["#E7F4EA", "#1F5C30"], "Excusé": ["#FFF6D6", "#6B4A00"], "Absent": ["#FDECEC", "#9E1B1B"] };
  return <Sheet title={row.nom} onClose={onClose} wide>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <Chip>{row.statut}</Chip><Chip>{row.presences}/{row.seances} · {row.seances ? pct(row.taux) : "—"}</Chip><Chip bg="#FFF6D6" fg="#6B4A00">Total {eur(row.total)}</Chip>
    </div>
    {!validated && <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {seances.filter((s) => s.compte && s.statut === "Pointée" && stOf(s.id)).map((s) => { const st = stOf(s.id); return <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "#F7F8FA", borderRadius: 12 }}>
        <span style={{ flex: 1, fontSize: 13.5 }}><b>{fmtDate(s.date)}</b> · {s.type}{s.adversaire ? " vs " + s.adversaire : ""}{s.resultat ? " · " + s.resultat : ""}</span>
        <Chip bg={TONE[st][0]} fg={TONE[st][1]}>{st}</Chip>
        {canCorr && st === "Absent" && <button className="btn btn-ghost" disabled={busyId === s.id} onClick={() => excuse(s.id, true)} style={{ minHeight: 34, fontSize: 12.5 }}>Excuser</button>}
        {canCorr && st === "Excusé" && <button className="btn btn-ghost" disabled={busyId === s.id} onClick={() => excuse(s.id, false)} style={{ minHeight: 34, fontSize: 12.5 }}>Retirer l'excuse</button>}
      </div>; })}
      {seances.filter((s) => s.compte && s.statut === "Pointée" && !stOf(s.id)).length > 0 && <div style={{ fontSize: 12.5, color: MUT }}>Les séances antérieures à son entrée (ou postérieures à sa sortie) ne comptent pas pour lui.</div>}
      <div style={{ fontSize: 12.5, color: MUT }}>Pour corriger une présence oubliée, rouvre la séance dans l'onglet Séances et modifie le pointage.</div>
    </div>}
    {(row.extras || []).length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".06em", color: MUT }}>PRIMES EXCEPTIONNELLES ET RÉGULARISATIONS</div>
      {row.extras.map((x) => <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "#F7F8FA", borderRadius: 12 }}>
        <span style={{ flex: 1, fontSize: 13.5 }}><b>{x.type}</b> · {x.motif}</span><b>{eur(x.montant)}</b>
        {canCorr && !validated && <button aria-label="Retirer" className="btn btn-ghost" onClick={() => delExtra(x)} style={{ minHeight: 34 }}><i className="ti ti-trash" aria-hidden="true" />Retirer</button>}
      </div>)}
    </div>}
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button className="btn btn-ghost" onClick={() => setCard(true)}><i className="ti ti-id" aria-hidden="true" />Voir la fiche du joueur</button>
      {canCorr && <button className="btn btn-ghost" onClick={onExtra}><i className="ti ti-plus" aria-hidden="true" />Ajouter une prime ou une régularisation</button>}
    </div>
    {card && <PlayerCard joueurId={row.joueur} onClose={() => setCard(false)} />}
  </Sheet>;
}

function ExtraForm({ teamId, month, rows, preset, validated, onClose, onDone }) {
  const [form, setForm] = useState({ joueurId: preset || "", type: validated ? "Régularisation" : "Exceptionnelle", sens: "+", montant: "", motif: "", month });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const m = Math.abs(Number(String(form.montant).replace(",", ".")));
    if (!form.joueurId) return alert("Choisis un joueur.");
    if (!m) return alert("Indique un montant.");
    if (!form.motif.trim()) return alert("Le motif est obligatoire.");
    setBusy(true);
    try { await primesApi({ action: "extra", teamId, joueurId: form.joueurId, month: form.month, type: form.type, montant: form.type === "Régularisation" && form.sens === "-" ? -m : m, motif: form.motif.trim() }); await onDone(form.month); }
    catch (e) { if (e.body && e.body.next) { setForm({ ...form, month: e.body.next }); alert(e.message); } else alert(e.message); }
    setBusy(false);
  };
  return <Sheet title={form.type === "Régularisation" ? "Régularisation" : "Prime exceptionnelle"} onClose={onClose}>
    <div role="group" aria-label="Type" style={{ display: "flex", gap: 6 }}>
      {["Exceptionnelle", "Régularisation"].map((t) => <button key={t} aria-pressed={form.type === t} className={"btn " + (form.type === t ? "btn-dark" : "btn-ghost")} onClick={() => setForm({ ...form, type: t })}>{t === "Exceptionnelle" ? "Prime exceptionnelle" : "Régularisation (+/−)"}</button>)}
    </div>
    <div><label className="lbl" htmlFor="ex-j">Joueur</label>
      <select id="ex-j" className="sel" value={form.joueurId} onChange={(e) => setForm({ ...form, joueurId: e.target.value })}><option value="">Choisir…</option>{rows.map((r) => <option key={r.joueur} value={r.joueur}>{r.nom}</option>)}</select></div>
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
      {form.type === "Régularisation" && <div role="group" aria-label="Sens" style={{ display: "flex", gap: 4 }}>{["+", "-"].map((s) => <button key={s} aria-pressed={form.sens === s} className={"btn " + (form.sens === s ? "btn-dark" : "btn-ghost")} style={{ minWidth: 48 }} onClick={() => setForm({ ...form, sens: s })}>{s === "+" ? "+ À ajouter" : "− À retirer"}</button>)}</div>}
      <div style={{ flex: 1 }}><label className="lbl" htmlFor="ex-m">Montant (€)</label><input id="ex-m" className="inp" inputMode="decimal" value={form.montant} onChange={(e) => setForm({ ...form, montant: e.target.value })} placeholder="ex. 16,67" /></div>
    </div>
    <div><label className="lbl" htmlFor="ex-mo">Motif (obligatoire, visible au journal)</label><input id="ex-mo" className="inp" value={form.motif} onChange={(e) => setForm({ ...form, motif: e.target.value })} placeholder={form.type === "Régularisation" ? "ex. Présence du 03/09 oubliée" : "ex. Meilleur buteur du tournoi"} /></div>
    <div style={{ fontSize: 12.5, color: MUT }}>Payée avec les primes de <b style={{ textTransform: "capitalize" }}>{monthLabel(form.month)}</b>.{validated ? " Le mois affiché est validé : la correction passe sur le mois suivant." : ""}</div>
    <div style={{ display: "flex", gap: 8 }}><button className="btn btn-red" disabled={busy} onClick={save}>Enregistrer</button><button className="btn btn-ghost" onClick={onClose}>Annuler</button></div>
  </Sheet>;
}

// =====================================================================================
// Paiements (comptabilité)
// =====================================================================================
export function PaymentsPanel({ rights }) {
  const [d, setD] = useState(null);
  const [sel, setSel] = useState(new Set());
  const [fil, setFil] = useState({ period: "all", team: "all", status: "À payer", q: "" });
  const [paying, setPaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const [l, t, p] = await Promise.all([db({ action: "list", table: "Primes – Lignes" }), db({ action: "list", table: "Équipes" }), db({ action: "list", table: "Joueurs" })]);
      setD({ lines: (l.records || []).filter((x) => (f(x, "Mois") || []).length), teams: t.records || [], players: p.records || [] });
    } catch (e) { setD({ error: e.message, lines: [], teams: [], players: [] }); }
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!d) return <div className="card" style={{ color: MUT }}>Chargement des primes…</div>;
  const pName = (id) => { const p = d.players.find((x) => x.id === id); return p ? ((f(p, "Prénom") || "") + " " + (f(p, "Nom") || "")).trim() : "Joueur"; };
  const tName = (id) => f(d.teams.find((x) => x.id === id), "Nom") || "?";
  const periods = [...new Set(d.lines.map((l) => f(l, "Période")))].filter(Boolean).sort().reverse();
  const teamIds = [...new Set(d.lines.map((l) => (f(l, "Équipe") || [])[0]))].filter(Boolean);
  const rows = d.lines.filter((l) => (fil.period === "all" || f(l, "Période") === fil.period) && (fil.team === "all" || (f(l, "Équipe") || [])[0] === fil.team)
    && (fil.status === "all" || (f(l, "Paiement") || "À payer") === fil.status) && (!fil.q || norm(pName((f(l, "Joueur") || [])[0])).includes(norm(fil.q))))
    .sort((a, b) => String(f(b, "Période")).localeCompare(String(f(a, "Période"))) || norm(pName((f(a, "Joueur") || [])[0]).split(" ").slice(-1)[0]).localeCompare(norm(pName((f(b, "Joueur") || [])[0]).split(" ").slice(-1)[0])));
  const sum = (list) => list.reduce((t, l) => t + (Number(f(l, "Montant")) || 0), 0);
  const selRows = rows.filter((l) => sel.has(l.id));
  const allOn = rows.length > 0 && rows.every((l) => sel.has(l.id));
  const toggleAll = () => setSel(allOn ? new Set() : new Set(rows.map((l) => l.id)));
  const toggle = (id) => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n); };
  const canPay = has(rights, "compta");
  const act = async (status, extra = {}) => {
    if (!selRows.length) return;
    setBusy(true);
    try { const r = await primesApi({ action: "pay", lineIds: selRows.map((l) => l.id), status, ...extra }); setSel(new Set()); setPaying(false); await load(); alert(r.count + " ligne(s) · " + eur(r.total) + " → " + status); }
    catch (e) { alert(e.message); }
    setBusy(false);
  };
  const exportCsv = () => downloadCsv("paiements-primes" + (fil.period !== "all" ? "-" + fil.period : "") + ".csv",
    [["Joueur", "Équipe", "Mois", "Type", "Motif", "Montant", "Paiement", "Payé le", "Mode", "Référence"]].concat(rows.map((l) => [pName((f(l, "Joueur") || [])[0]), tName((f(l, "Équipe") || [])[0]), f(l, "Période"), f(l, "Type"), f(l, "Motif") || "", Number(f(l, "Montant")) || 0, f(l, "Paiement") || "À payer", f(l, "Payé le") || "", f(l, "Mode") || "", f(l, "Référence") || ""])));
  // Total par joueur (un virement par joueur).
  const byPlayer = {}; selRows.forEach((l) => { const j = (f(l, "Joueur") || [])[0]; byPlayer[j] = (byPlayer[j] || 0) + (Number(f(l, "Montant")) || 0); });

  return <div className="fade" style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 1100 }}>
    {d.error && <div className="card" style={{ borderLeft: "4px solid " + RED }}>{d.error}</div>}
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {["À payer", "Mis en paiement", "Payé"].map((s) => { const list = d.lines.filter((l) => (f(l, "Paiement") || "À payer") === s && (fil.period === "all" || f(l, "Période") === fil.period)); return <Stat key={s} label={s.toUpperCase() + " · " + list.length} value={eur(sum(list))} tone={PAY_TONE[s][1]} />; })}
    </div>
    <div className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: 12 }}>
      <select className="sel" aria-label="Mois" value={fil.period} onChange={(e) => { setFil({ ...fil, period: e.target.value }); setSel(new Set()); }} style={{ width: "auto" }}><option value="all">Tous les mois</option>{periods.map((p) => <option key={p} value={p}>{monthLabel(p)}</option>)}</select>
      {teamIds.length > 1 && <select className="sel" aria-label="Équipe" value={fil.team} onChange={(e) => { setFil({ ...fil, team: e.target.value }); setSel(new Set()); }} style={{ width: "auto" }}><option value="all">Toutes les équipes</option>{teamIds.map((t) => <option key={t} value={t}>{tName(t)}</option>)}</select>}
      <div role="group" aria-label="Statut" style={{ display: "flex", gap: 4, background: "#E9EBEF", borderRadius: 30, padding: 4, flexWrap: "wrap" }}>
        {[["all", "Tous"], ["À payer", "À payer"], ["Mis en paiement", "Mis en paiement"], ["Payé", "Payés"]].map(([k, l]) => <button key={k} aria-pressed={fil.status === k} onClick={() => { setFil({ ...fil, status: k }); setSel(new Set()); }} style={{ minHeight: 34, padding: "0 12px", border: "none", borderRadius: 30, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 800, background: fil.status === k ? BLACK : "transparent", color: fil.status === k ? "#fff" : "#3A3F47" }}>{l}</button>)}
      </div>
      <input className="inp" aria-label="Rechercher un joueur" placeholder="Rechercher un joueur…" value={fil.q} onChange={(e) => setFil({ ...fil, q: e.target.value })} style={{ flex: "1 1 160px", width: "auto" }} />
      <button className="btn btn-ghost" onClick={exportCsv} disabled={!rows.length}><i className="ti ti-file-spreadsheet" aria-hidden="true" />Exporter (Excel)</button>
    </div>
    <div className="card" style={{ padding: 0, overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 720 }}>
        <thead><tr style={{ color: MUT, fontSize: 11.5, letterSpacing: ".04em", textAlign: "left" }}>
          <th style={{ padding: 10, borderBottom: "1px solid " + BORDER }}>{canPay && <input type="checkbox" aria-label="Tout sélectionner" checked={allOn} onChange={toggleAll} style={{ width: 18, height: 18, accentColor: RED }} />}</th>
          {["JOUEUR", "ÉQUIPE", "MOIS", "TYPE", "MONTANT", "PAIEMENT"].map((h) => <th key={h} style={{ padding: 10, borderBottom: "1px solid " + BORDER, fontWeight: 800, textAlign: h === "MONTANT" ? "right" : "left" }}>{h}</th>)}
        </tr></thead>
        <tbody>
          {rows.map((l) => { const st = f(l, "Paiement") || "À payer"; return <tr key={l.id} onClick={() => canPay && toggle(l.id)} style={{ borderBottom: "1px solid " + BORDER, cursor: canPay ? "pointer" : "default", background: sel.has(l.id) ? "#FFF9E6" : "transparent" }}>
            <td style={{ padding: 10 }}>{canPay && <input type="checkbox" aria-label={"Sélectionner " + pName((f(l, "Joueur") || [])[0])} checked={sel.has(l.id)} onChange={() => toggle(l.id)} onClick={(e) => e.stopPropagation()} style={{ width: 18, height: 18, accentColor: RED }} />}</td>
            <td style={{ padding: 10, fontWeight: 800 }}>{pName((f(l, "Joueur") || [])[0])}</td>
            <td style={{ padding: 10 }}>{tName((f(l, "Équipe") || [])[0])}</td>
            <td style={{ padding: 10, textTransform: "capitalize" }}>{monthLabel(f(l, "Période"))}</td>
            <td style={{ padding: 10 }}>{f(l, "Type")}{f(l, "Motif") ? <div style={{ fontSize: 12, color: MUT }}>{f(l, "Motif")}</div> : null}</td>
            <td style={{ padding: 10, textAlign: "right", fontWeight: 800, color: Number(f(l, "Montant")) < 0 ? "#9E1B1B" : TEXT }}>{eur(f(l, "Montant"))}</td>
            <td style={{ padding: 10 }}><Chip bg={PAY_TONE[st][0]} fg={PAY_TONE[st][1]}>{st}</Chip>{st === "Payé" && <div style={{ fontSize: 12, color: MUT, marginTop: 3 }}>{[f(l, "Payé le") && new Date(f(l, "Payé le") + "T12:00:00").toLocaleDateString("fr-FR"), f(l, "Mode"), f(l, "Référence")].filter(Boolean).join(" · ")}</div>}</td>
          </tr>; })}
          {!rows.length && <tr><td colSpan={7} style={{ padding: 16, color: MUT }}>{d.lines.length ? "Aucune ligne pour ces filtres." : "Aucun mois validé pour l'instant : les lignes apparaissent ici dès qu'un mois de primes est validé."}</td></tr>}
        </tbody>
      </table>
    </div>
    {canPay && selRows.length > 0 && <div className="card" style={{ position: "sticky", bottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", boxShadow: "0 8px 30px rgba(0,0,0,.12)" }}>
      <b>{selRows.length} ligne(s) · {Object.keys(byPlayer).length} joueur(s) · {eur(sum(selRows))}</b>
      <span style={{ flex: 1 }} />
      <button className="btn btn-ghost" disabled={busy} onClick={() => act("Mis en paiement")}>Mettre en paiement</button>
      <button className="btn btn-red" disabled={busy} onClick={() => setPaying(true)}>Marquer payé…</button>
      <button className="btn btn-ghost" disabled={busy} onClick={() => { if (confirm("Repasser ces lignes à « À payer » ?")) act("À payer"); }}>Repasser à payer</button>
    </div>}
    {paying && <PayForm count={selRows.length} total={sum(selRows)} busy={busy} onClose={() => setPaying(false)} onConfirm={(x) => act("Payé", x)} />}
  </div>;
}

function PayForm({ count, total, busy, onClose, onConfirm }) {
  const [x, setX] = useState({ date: todayIso(), mode: "Virement", autre: "", ref: "" });
  return <Sheet title={"Marquer payé · " + count + " ligne(s) · " + eur(total)} onClose={onClose}>
    <div><label className="lbl" htmlFor="pf-d">Date du paiement</label><input id="pf-d" type="date" className="inp" value={x.date} onChange={(e) => setX({ ...x, date: e.target.value })} /></div>
    <div><label className="lbl" htmlFor="pf-m">Mode</label><select id="pf-m" className="sel" value={x.mode} onChange={(e) => setX({ ...x, mode: e.target.value })}><option>Virement</option><option>Autre</option></select></div>
    {x.mode === "Autre" && <div><label className="lbl" htmlFor="pf-a">Préciser</label><input id="pf-a" className="inp" value={x.autre} onChange={(e) => setX({ ...x, autre: e.target.value })} placeholder="ex. chèque, espèces" /></div>}
    <div><label className="lbl" htmlFor="pf-r">Référence (facultatif)</label><input id="pf-r" className="inp" value={x.ref} onChange={(e) => setX({ ...x, ref: e.target.value })} placeholder="ex. VIR-2026-10" /></div>
    <div style={{ display: "flex", gap: 8 }}><button className="btn btn-red" disabled={busy} onClick={() => onConfirm({ date: x.date, mode: x.mode === "Autre" ? (x.autre.trim() || "Autre") : "Virement", ref: x.ref.trim() })}>Confirmer le paiement</button><button className="btn btn-ghost" onClick={onClose}>Annuler</button></div>
  </Sheet>;
}
