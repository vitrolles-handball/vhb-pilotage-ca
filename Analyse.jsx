// Analyse des matchs (à partir des feuilles de match FFHB importées) :
// onglet Analyse (Équipe / Matchs / Joueurs), page d'un match, import d'une feuille, petit bloc dans la fiche match.
import React, { useState, useEffect, useMemo } from "react";
import { db, f } from "./App.jsx";
import { PlayerCard } from "./Fiche.jsx";
import { readFeuille, matchPlayer, isUs, buildStored, capName } from "./feuille.js";

// Couleurs de la charte (valeurs écrites en dur : pas de constante importée au niveau du module, imports circulaires).
const C = { red: "#C2261B", orange: "#E8800C", yellow: "#F2C318", black: "#16181D", green: "#2E7D46", abs: "#D93B30", blue: "#2F6FD6", mut: "#6B7079", grey: "#C9CDD3", line: "#ECEEF1", bg: "#F2F3F6", text: "#16181D" };
const card = { background: "#fff", borderRadius: 20, padding: "16px 16px", boxShadow: "0 1px 3px rgba(20,22,30,.06)" };
const kicker = { fontSize: 11.5, fontWeight: 800, letterSpacing: ".06em", color: C.mut };
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const dShort = (iso) => { const d = new Date(iso + "T12:00:00"); return d.getDate() + " " + MOIS[d.getMonth()]; };
const mmss = (sec) => String(Math.floor(sec / 60)).padStart(2, "0") + "'";
const r1 = (x) => (Math.round(x * 10) / 10).toLocaleString("fr-FR");
const pctS = (x) => x == null ? "–" : Math.round(x * 100) + " %";
// « FERRAND Mathieu » → « Mathieu Ferrand »
const sheetName = (n) => { const p = String(n || "").split(" "); const up = p.filter((x) => x === x.toUpperCase() && /[A-Z]/.test(x)); const lo = p.filter((x) => !up.includes(x)); return (lo.join(" ") + " " + capName(up.join(" "))).trim(); };
const resOf = (s) => s[0] > s[1] ? "V" : s[0] === s[1] ? "N" : "D";
const RES = { V: ["Victoire", "#2E7D46", "#fff"], N: ["Nul", "#F2C318", "#16181D"], D: ["Défaite", "#D93B30", "#fff"] };

export const sheetOf = (s) => { const v = f(s, "Feuille de match"); if (!v) return null; try { const j = JSON.parse(v); return j && Array.isArray(j.us) ? j : null; } catch (e) { return null; } };

// ------------------------------------------------------------------ Calculs
// Matchs d'une équipe avec feuille importée, du plus ancien au plus récent.
function teamMatches(d, teamId) {
  return d.seances.filter((s) => (f(s, "Équipe") || []).includes(teamId) && f(s, "Type") === "Match")
    .map((s) => ({ s, F: sheetOf(s) })).sort((a, b) => String(f(a.s, "Date")).localeCompare(String(f(b.s, "Date"))));
}
function playerTable(ms, d) {
  const P = new Map();
  for (const { s, F } of ms) {
    for (const p of F.us) {
      const k = p.id || "n:" + p.n;
      const o = P.get(k) || { key: k, id: p.id, nom: null, m: 0, b: 0, b7: 0, t: 0, tb: 0, ar: 0, m2: 0, av: 0, d: 0, best: 0, bestAdv: "", gk: false };
      o.m++; o.b += p.b; o.b7 += p.b7; o.ar += p.ar; o.m2 += p.m2; o.av += p.av; o.d += p.d;
      if (p.t >= p.b && p.t > 0) { o.t += p.t; o.tb += p.b; } // tirs incohérents (moins de tirs que de buts) : ignorés pour l'efficacité
      if (p.b > o.best) { o.best = p.b; o.bestAdv = F.adv; }
      if (!o.nom) { const pl = p.id && d.players.find((x) => x.id === p.id); o.nom = pl ? ((f(pl, "Prénom") || "") + " " + (f(pl, "Nom") || "")).trim() : sheetName(p.n); }
      if (p.id) { const pl = d.players.find((x) => x.id === p.id); if (pl && f(pl, "Poste") === "Gardien") o.gk = true; }
      P.set(k, o);
    }
  }
  return [...P.values()].map((o) => ({ ...o, gk: o.gk || o.ar >= 5, moy: o.m ? o.b / o.m : 0, eff: o.t ? o.tb / o.t : null }));
}

// ------------------------------------------------------------------ Éléments visuels
function Banner({ title, sub, children }) {
  return <div style={{ backgroundColor: "#E8590C", backgroundImage: "linear-gradient(rgba(28,10,0,.16), rgba(28,10,0,.38)), url(/accent.jpg)", backgroundSize: "cover", backgroundPosition: "center", color: "#fff", borderRadius: 24, padding: "18px 18px 0", overflow: "hidden" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span aria-hidden="true" style={{ width: 44, height: 44, borderRadius: 22, background: C.black, color: C.yellow, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}><i className="ti ti-chart-bar" style={{ fontSize: 22 }} /></span>
      <div style={{ minWidth: 0, flex: 1 }}><div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.15 }}>{title}</div><div style={{ fontSize: 13, opacity: .9, fontWeight: 600 }}>{sub}</div></div>
    </div>
    {children}
  </div>;
}
function Stat({ k, v, sub, tone, dark }) {
  return <div style={{ ...card, padding: "14px 14px", background: dark ? C.black : "#fff", color: dark ? "#fff" : C.text, borderBottom: tone ? "4px solid " + tone : undefined }}>
    <div style={{ ...kicker, color: dark ? C.yellow : C.mut }}>{k}</div>
    <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4, whiteSpace: "nowrap", color: dark ? "#fff" : tone && tone !== C.yellow ? tone : C.text }}>{v}</div>
    {sub && <div style={{ fontSize: 12, color: dark ? "rgba(255,255,255,.75)" : C.mut, marginTop: 2 }}>{sub}</div>}
  </div>;
}
function GoalBars({ ms, onOpen }) {
  const max = Math.max(10, ...ms.map(({ F }) => Math.max(F.s[0], F.s[1])));
  return <div style={{ overflowX: "auto", margin: "0 -4px" }}>
    <div role="img" aria-label={"Buts par match : " + ms.map(({ F }) => F.adv + " " + F.s[0] + "-" + F.s[1]).join(", ")} style={{ display: "grid", gridTemplateColumns: "repeat(" + ms.length + ", minmax(52px, 1fr))", gap: 8, alignItems: "end", height: 180, padding: "0 4px", minWidth: ms.length * 58 }}>
      {ms.map(({ s, F }) => { const r = resOf(F.s); return <button key={s.id} onClick={() => onOpen(s.id)} title={"Ouvrir le match contre " + F.adv} style={{ border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 4, height: "100%", padding: 0 }}>
        <span style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 128 }}>
          <span style={{ width: 15, height: Math.max(4, F.s[0] / max * 128), background: r === "V" ? C.green : r === "N" ? C.yellow : C.abs, borderRadius: "5px 5px 2px 2px" }} />
          <span style={{ width: 15, height: Math.max(4, F.s[1] / max * 128), background: C.grey, borderRadius: "5px 5px 2px 2px" }} />
        </span>
        <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{F.s[0]}–{F.s[1]}</span>
        <span style={{ fontSize: 11, color: C.mut, maxWidth: 64, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{F.adv.split(" ")[0]}</span>
      </button>; })}
    </div>
  </div>;
}
// Évolution du score minute par minute (écart VHB − adversaire).
export function ScoreCurve({ F, h = 190 }) {
  const pts = [[0, 0, 0], ...F.goals];
  const W = 600, H = h, max = Math.max(4, ...pts.map((p) => Math.abs(p[1] - p[2])));
  const x = (t) => 8 + (Math.min(t, 3600) / 3600) * (W - 16), y = (dv) => H / 2 - (dv / max) * (H / 2 - 12);
  let d = "M" + x(0) + "," + y(0);
  for (const [t, v, a] of pts.slice(1)) d += " H" + x(t).toFixed(1) + " V" + y(v - a).toFixed(1);
  d += " H" + x(3600);
  const best = pts.reduce((m, p) => Math.max(m, p[1] - p[2]), 0), worst = pts.reduce((m, p) => Math.min(m, p[1] - p[2]), 0);
  return <div>
    <svg viewBox={"0 0 " + W + " " + H} role="img" aria-label={"Évolution de l'écart au score. Plus grosse avance : " + best + " buts" + (worst < 0 ? ", plus gros retard : " + -worst : "")} style={{ width: "100%", height: "auto", display: "block" }}>
      <rect x="0" y="0" width={W} height={H / 2} fill="#FFF6EC" /><rect x="0" y={H / 2} width={W} height={H / 2} fill="#F4F5F8" />
      <line x1={x(1800)} x2={x(1800)} y1="0" y2={H} stroke="#C9CDD3" strokeDasharray="4 4" />
      <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="#9AA0A8" />
      <path d={d} fill="none" stroke={C.orange} strokeWidth="4" strokeLinejoin="round" />
      {F.excl.filter((e) => e[1] === "V").map((e, i) => <circle key={i} cx={x(e[0])} cy={H - 6} r="6" fill={C.abs} />)}
      <text x={x(1800) + 8} y="22" fontSize="19" fill="#6B7079">mi-temps{F.mt ? " " + F.mt[0] + "–" + F.mt[1] : ""}</text>
      <text x="8" y="22" fontSize="19" fill="#8A4B00">VHB devant</text>
      <text x="8" y={H - 18} fontSize="19" fill="#6B7079">adversaire devant</text>
    </svg>
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: C.mut, marginTop: 6 }}>
      <span>Plus grosse avance : <b style={{ color: C.text }}>+{best}</b></span>
      {worst < 0 && <span>Plus gros retard : <b style={{ color: C.text }}>{worst}</b></span>}
      {F.excl.some((e) => e[1] === "V") && <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: C.abs, marginRight: 5 }} />nos exclusions</span>}
    </div>
  </div>;
}
function ResChip({ s }) { const [l, bg, fg] = RES[resOf(s)]; return <span style={{ fontSize: 12, fontWeight: 800, padding: "3px 10px", borderRadius: 12, background: bg, color: fg }}>{l}</span>; }
const Medal = ({ i }) => <span style={{ width: 24, height: 24, borderRadius: 12, flex: "0 0 auto", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11.5, fontWeight: 800, background: i === 0 ? C.yellow : i === 1 ? "#D7DADF" : i === 2 ? "#E8B07A" : "transparent", color: i < 3 ? C.black : C.mut }}>{i + 1}</span>;

// ------------------------------------------------------------------ Page d'un match (feuille importée)
export function MatchSheetDetail({ s, F, d, onOpenPlayer }) {
  const rows = [...F.us].sort((a, b) => b.b - a.b || b.ar - a.ar);
  const nameOf = (p) => { const pl = p.id && d.players.find((x) => x.id === p.id); return pl ? ((f(pl, "Prénom") || "") + " " + (f(pl, "Nom") || "")).trim() : sheetName(p.n); };
  const gk = F.us.filter((p) => p.ar > 0);
  const sumUs = (k) => F.us.reduce((a, p) => a + (p[k] || 0), 0);
  return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
      <Stat k="MI-TEMPS" v={F.mt ? F.mt[0] + " – " + F.mt[1] : "–"} sub={F.mt ? "2e période " + (F.s[0] - F.mt[0]) + " – " + (F.s[1] - F.mt[1]) : ""} />
      <Stat k="7 MÈTRES" v={String(sumUs("b7"))} sub={"adversaire : " + F.them.b7} />
      <Stat k="ARRÊTS GB" v={String(sumUs("ar"))} sub={"adversaire : " + F.them.ar} />
      <Stat k="EXCLUSIONS 2'" v={String(sumUs("m2"))} sub={"adversaire : " + F.them.m2} tone={C.abs} />
    </div>
    {F.goals && F.goals.length > 2 && <div style={card}><div style={{ fontWeight: 800, fontSize: 15, marginBottom: 10 }}>Le match minute par minute</div><ScoreCurve F={F} /></div>}
    <div style={{ ...card, padding: "12px 0 6px" }}>
      <div style={{ fontWeight: 800, fontSize: 15, padding: "0 16px 8px" }}>Nos joueurs</div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 460 }}>
          <thead><tr style={{ color: C.mut, fontSize: 11.5, letterSpacing: ".04em", textAlign: "right", whiteSpace: "nowrap" }}>
            <th style={{ textAlign: "left", padding: "6px 16px", fontWeight: 800 }}>JOUEUR</th><th style={{ padding: "6px 8px", fontWeight: 800 }}>BUTS</th><th style={{ padding: "6px 8px", fontWeight: 800 }}>7 M</th><th style={{ padding: "6px 8px", fontWeight: 800 }}>TIRS</th><th style={{ padding: "6px 8px", fontWeight: 800 }}>ARRÊTS</th><th style={{ padding: "6px 16px 6px 8px", fontWeight: 800 }}>SANCTIONS</th>
          </tr></thead>
          <tbody>{rows.map((p) => <tr key={p.lic || p.n} style={{ borderTop: "1px solid " + C.line, cursor: p.id ? "pointer" : "default" }} onClick={() => p.id && onOpenPlayer && onOpenPlayer(p.id)}>
            <td style={{ padding: "8px 16px", fontWeight: 700, whiteSpace: "nowrap" }}><span style={{ display: "inline-block", minWidth: 26, color: C.mut, fontWeight: 800, fontSize: 12 }}>{p.num}</span>{nameOf(p)}{p.c ? <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 800, background: C.black, color: C.yellow, padding: "1px 5px", borderRadius: 6 }}>CAPT</span> : null}</td>
            <td style={{ padding: "8px", textAlign: "right", fontWeight: 800, fontSize: 15 }}>{p.b || <span style={{ color: "#B8BDC4", fontWeight: 600 }}>–</span>}</td>
            <td style={{ padding: "8px", textAlign: "right" }}>{p.b7 || ""}</td>
            <td style={{ padding: "8px", textAlign: "right", color: C.mut }}>{p.t >= p.b && p.t ? p.t : ""}</td>
            <td style={{ padding: "8px", textAlign: "right", fontWeight: p.ar ? 800 : 400 }}>{p.ar || ""}</td>
            <td style={{ padding: "8px 16px 8px 8px", textAlign: "right", whiteSpace: "nowrap" }}>{p.av ? <span title="Avertissement" style={{ display: "inline-block", width: 10, height: 13, borderRadius: 2, background: C.yellow, marginLeft: 4, verticalAlign: "-1px" }} /> : null}{p.m2 ? <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 800, color: C.abs }}>{p.m2}×2'</span> : null}{p.d ? <span title="Disqualification" style={{ display: "inline-block", width: 10, height: 13, borderRadius: 2, background: C.abs, marginLeft: 4, verticalAlign: "-1px" }} /> : null}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
      <div style={card}><div style={kicker}>NOS GARDIENS</div>
        {gk.length ? gk.map((p) => <div key={p.n} style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 14 }}><span style={{ fontWeight: 700 }}>{nameOf(p)}</span><b>{p.ar} arrêt{p.ar > 1 ? "s" : ""}</b></div>) : <div style={{ fontSize: 13, color: C.mut, marginTop: 6 }}>Aucun arrêt noté.</div>}
      </div>
      <div style={card}><div style={kicker}>{F.adv.toUpperCase()}</div>
        <div style={{ fontSize: 13.5, marginTop: 8, lineHeight: 1.6 }}>{F.them.top.length ? <>Meilleurs buteurs : {F.them.top.map(([n, b]) => sheetName(n) + " (" + b + ")").join(", ")}</> : "—"}<br />{F.them.gk.length ? "Gardiens : " + F.them.gk.map(([n, a]) => sheetName(n) + " (" + a + " arrêts)").join(", ") : ""}</div>
      </div>
    </div>
    <div style={{ fontSize: 12, color: C.mut }}>{[F.comp, F.j, F.salle, F.code ? "Rencontre " + F.code : ""].filter(Boolean).join(" · ")}{F.to && F.to.length ? " · temps morts : VHB " + F.to.filter((t) => t[1] === "V").length + ", adversaire " + F.to.filter((t) => t[1] === "A").length : ""}</div>
  </div>;
}

// ------------------------------------------------------------------ Onglet Analyse
export function AnalyseView({ teams, d, initialTeam, onOpenSeance }) {
  const withSheets = teams.filter((t) => d.seances.some((s) => (f(s, "Équipe") || []).includes(t.id) && sheetOf(s)));
  const [teamId, setTeamId] = useState(() => (initialTeam && teams.some((t) => t.id === initialTeam) ? initialTeam : (withSheets[0] || teams[0] || {}).id));
  const [tab, setTab] = useState(() => { try { return localStorage.getItem("vhb_analyse_tab") || "equipe"; } catch (e) { return "equipe"; } });
  const [openM, setOpenM] = useState(null);
  const [player, setPlayer] = useState(null);
  const [sort, setSort] = useState("b");
  const setT = (t) => { setTab(t); setOpenM(null); try { localStorage.setItem("vhb_analyse_tab", t); } catch (e) {} };
  const team = teams.find((t) => t.id === teamId);
  const all = useMemo(() => teamMatches(d, teamId), [d, teamId]);
  const ms = all.filter((x) => x.F);
  const table = useMemo(() => playerTable(ms, d), [ms, d]);
  if (!teams.length) return <div className="card" style={{ color: C.mut }}>Aucune équipe.</div>;
  const tot = ms.reduce((a, { F }) => ({ v: a.v + (F.s[0] > F.s[1]), n: a.n + (F.s[0] === F.s[1]), d: a.d + (F.s[0] < F.s[1]), bp: a.bp + F.s[0], bc: a.bc + F.s[1], m1: a.m1 + (F.mt ? F.mt[0] : 0), m1c: a.m1c + (F.mt ? F.mt[1] : 0), mtN: a.mtN + (F.mt ? 1 : 0), m2: a.m2 + F.us.reduce((x, p) => x + p.m2, 0), m2a: a.m2a + F.them.m2, av: a.av + F.us.reduce((x, p) => x + p.av, 0), b7: a.b7 + F.us.reduce((x, p) => x + p.b7, 0), behind: a.behind + (F.mt && F.mt[0] < F.mt[1] ? 1 : 0) }), { v: 0, n: 0, d: 0, bp: 0, bc: 0, m1: 0, m1c: 0, mtN: 0, m2: 0, m2a: 0, av: 0, b7: 0, behind: 0 });
  const n = ms.length;
  const scorers = [...table].filter((p) => !p.gk || p.b > 0).sort((a, b) => b.b - a.b);
  const keepers = [...table].filter((p) => p.gk && p.ar > 0).sort((a, b) => b.ar - a.ar);
  const curM = openM && all.find((x) => x.s.id === openM);
  const tabs = [["equipe", "Équipe", "ti-users-group"], ["matchs", "Matchs", "ti-ball-football"], ["joueurs", "Joueurs", "ti-list-numbers"]];
  const missing = all.filter((x) => !x.F && f(x.s, "Statut") === "Pointée");

  const header = <Banner title={"Analyse · " + (f(team, "Nom") || "")} sub={(f(team, "Saison") || "") + " · " + n + " feuille" + (n > 1 ? "s" : "") + " de match importée" + (n > 1 ? "s" : "")}>
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, marginTop: 14, flexWrap: "wrap" }}>
      {tabs.map(([k, l, ic]) => <button key={k} onClick={() => setT(k)} aria-pressed={tab === k} style={{ border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 800, padding: "10px 16px", borderRadius: "14px 14px 0 0", background: tab === k ? C.bg : "transparent", color: tab === k ? C.red : "#fff", display: "inline-flex", alignItems: "center", gap: 7 }}><i className={"ti " + ic} aria-hidden="true" />{l}</button>)}
      {teams.length > 1 && <select className="sel" aria-label="Équipe" value={teamId} onChange={(e) => { setTeamId(e.target.value); setOpenM(null); }} style={{ marginLeft: "auto", marginBottom: 8, width: "auto", minWidth: 120, minHeight: 36, borderRadius: 12, border: "none", fontWeight: 800 }}>{teams.map((t) => <option key={t.id} value={t.id}>{f(t, "Nom")}</option>)}</select>}
    </div>
  </Banner>;

  if (player) return <PlayerCard joueurId={player} teamId={teamId} backLabel="Analyse" onClose={() => setPlayer(null)} />;

  let body;
  if (!n) body = <div style={{ ...card, textAlign: "center", padding: "28px 18px" }}>
    <div aria-hidden="true" style={{ width: 56, height: 56, borderRadius: 28, background: "#FFF3C4", color: "#6B4A00", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}><i className="ti ti-file-upload" style={{ fontSize: 28 }} /></div>
    <div style={{ fontWeight: 800, fontSize: 17 }}>Importe une première feuille de match</div>
    <div style={{ fontSize: 13.5, color: C.mut, marginTop: 6, maxWidth: 440, marginInline: "auto" }}>Ouvre un match dans Séances, puis « Importer la feuille de match » et choisis le PDF de la FFHB. Les stats de l'équipe et des joueurs apparaîtront ici.</div>
  </div>;
  else if (curM && curM.F) body = <>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button className="btn btn-ghost" onClick={() => setOpenM(null)} aria-label="Retour aux matchs" style={{ padding: "8px 10px" }}><i className="ti ti-chevron-left" aria-hidden="true" /></button>
      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 800, fontSize: 17 }}>{curM.F.dom ? "VHB – " + curM.F.adv : curM.F.adv + " – VHB"}</div><div style={{ fontSize: 12.5, color: C.mut }}>{curM.F.j} · {dShort(f(curM.s, "Date"))} · {curM.F.dom ? "à domicile" : "à l'extérieur"}</div></div>
      {onOpenSeance && <button className="btn btn-ghost" onClick={() => onOpenSeance(curM.s.id)}><i className="ti ti-external-link" aria-hidden="true" />Fiche match</button>}
    </div>
    <div style={{ background: C.black, color: "#fff", borderRadius: 22, padding: "16px 18px", borderLeft: "6px solid " + C.yellow, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
      <span style={{ fontSize: 40, fontWeight: 800 }}>{curM.F.s[0]} <span style={{ color: "#8A8F98" }}>–</span> {curM.F.s[1]}</span><ResChip s={curM.F.s} />
    </div>
    <MatchSheetDetail s={curM.s} F={curM.F} d={d} onOpenPlayer={setPlayer} />
  </>;
  else if (tab === "equipe") body = <>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
      <Stat dark k="BILAN" v={tot.v + "V · " + tot.n + "N · " + tot.d + "D"} sub={n + " match" + (n > 1 ? "s" : "") + (tot.d === 0 ? " · invaincus" : "")} />
      <Stat k="BUTS POUR" v={String(tot.bp)} sub={r1(tot.bp / n) + " par match"} tone={C.green} />
      <Stat k="BUTS CONTRE" v={String(tot.bc)} sub={r1(tot.bc / n) + " par match"} tone={C.abs} />
      <Stat k="DIFFÉRENCE" v={(tot.bp - tot.bc >= 0 ? "+" : "") + (tot.bp - tot.bc)} sub={(tot.bp - tot.bc >= 0 ? "+" : "") + r1((tot.bp - tot.bc) / n) + " par match"} tone={C.yellow} />
    </div>
    <div style={card}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10, flexWrap: "wrap" }}><div style={{ fontWeight: 800, fontSize: 15, flex: 1 }}>Buts par match</div>
        <span style={{ fontSize: 12, color: C.mut, display: "inline-flex", flexWrap: "wrap", gap: "4px 12px" }}>{[[C.green, "Gagné"], [C.yellow, "Nul"], [C.abs, "Perdu"], [C.grey, "Adversaire"]].map(([c, l]) => <span key={l} style={{ whiteSpace: "nowrap" }}><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: c, marginRight: 5 }} />{l}</span>)}</span></div>
      <GoalBars ms={ms} onOpen={(id) => setOpenM(id)} />
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
      {tot.mtN > 0 && <div style={card}><div style={kicker}>1RE MI-TEMPS</div><div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{tot.m1} – {tot.m1c}</div>
        <div style={{ height: 7, borderRadius: 4, background: C.line, marginTop: 8, overflow: "hidden" }}><div style={{ width: (tot.m1 / Math.max(1, tot.m1 + tot.m1c) * 100) + "%", height: "100%", background: C.orange }} /></div>
        <div style={{ fontSize: 12, color: C.mut, marginTop: 6 }}>{tot.behind ? "menés à la pause " + tot.behind + " fois" : "jamais menés à la pause"}</div></div>}
      {tot.mtN > 0 && <div style={card}><div style={kicker}>2E MI-TEMPS</div><div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{tot.bp - tot.m1} – {tot.bc - tot.m1c}</div>
        <div style={{ height: 7, borderRadius: 4, background: C.line, marginTop: 8, overflow: "hidden" }}><div style={{ width: ((tot.bp - tot.m1) / Math.max(1, tot.bp - tot.m1 + tot.bc - tot.m1c) * 100) + "%", height: "100%", background: C.orange }} /></div>
        <div style={{ fontSize: 12, color: C.mut, marginTop: 6 }}>{(tot.bp - tot.m1) - (tot.bc - tot.m1c) >= 0 ? "+" : ""}{(tot.bp - tot.m1) - (tot.bc - tot.m1c)} sur la saison</div></div>}
      <div style={card}><div style={kicker}>DISCIPLINE</div><div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: C.abs }}>{tot.m2} × 2'</div>
        <div style={{ fontSize: 12, color: C.mut, marginTop: 6 }}>{tot.m2a} pour nos adversaires · {tot.av} avertissement{tot.av > 1 ? "s" : ""}</div></div>
      <div style={card}><div style={kicker}>7 MÈTRES MARQUÉS</div><div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{tot.b7}</div>
        <div style={{ fontSize: 12, color: C.mut, marginTop: 6 }}>{r1(tot.b7 / n)} par match</div></div>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10 }}>
      <div style={{ ...card, padding: "14px 0 8px" }}>
        <div style={{ display: "flex", alignItems: "baseline", padding: "0 16px 6px" }}><div style={{ fontWeight: 800, fontSize: 15, flex: 1 }}>Meilleurs buteurs</div><button className="btn btn-ghost" onClick={() => setT("joueurs")} style={{ minHeight: 30, fontSize: 12.5 }}>Tous les joueurs</button></div>
        {scorers.slice(0, 5).map((p, i) => <button key={p.key} onClick={() => p.id && setPlayer(p.id)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 16px", border: "none", borderTop: i ? "1px solid " + C.line : "none", background: "transparent", cursor: p.id ? "pointer" : "default", fontFamily: "inherit", textAlign: "left" }}>
          <Medal i={i} /><span style={{ flex: 1, fontWeight: 700, fontSize: 14, color: C.text }}>{p.nom}</span><span style={{ fontSize: 12, color: C.mut }}>{r1(p.moy)} / match</span><b style={{ fontSize: 17, minWidth: 28, textAlign: "right", color: C.text }}>{p.b}</b>
        </button>)}
      </div>
      <div style={{ ...card, padding: "14px 0 8px" }}>
        <div style={{ fontWeight: 800, fontSize: 15, padding: "0 16px 6px" }}>Gardiens</div>
        {keepers.length ? keepers.map((p, i) => <button key={p.key} onClick={() => p.id && setPlayer(p.id)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 16px", border: "none", borderTop: i ? "1px solid " + C.line : "none", background: "transparent", cursor: p.id ? "pointer" : "default", fontFamily: "inherit", textAlign: "left" }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, padding: "2px 6px", borderRadius: 6, background: C.black, color: "#fff" }}>GB</span><span style={{ flex: 1, fontWeight: 700, fontSize: 14, color: C.text }}>{p.nom}</span><span style={{ fontSize: 12, color: C.mut }}>{p.m} match{p.m > 1 ? "s" : ""} · {r1(p.ar / p.m)} / match</span><b style={{ fontSize: 17, minWidth: 28, textAlign: "right", color: C.text }}>{p.ar}</b>
        </button>) : <div style={{ fontSize: 13, color: C.mut, padding: "4px 16px" }}>Aucun arrêt noté.</div>}
        <div style={{ fontSize: 11.5, color: C.mut, padding: "6px 16px 0" }}>Nombre d'arrêts notés sur la feuille.</div>
      </div>
    </div>
  </>;
  else if (tab === "matchs") body = <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    {[...all].reverse().filter((x) => x.F || f(x.s, "Statut") === "Pointée").map(({ s, F }) => F ? <button key={s.id} onClick={() => setOpenM(s.id)} style={{ ...card, border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left", display: "flex", alignItems: "center", gap: 12, borderLeft: "5px solid " + (resOf(F.s) === "V" ? C.green : resOf(F.s) === "N" ? C.yellow : C.abs), padding: "12px 14px" }}>
      <div style={{ width: 52, textAlign: "center", flex: "0 0 auto" }}><div style={{ fontSize: 11, fontWeight: 800, color: C.mut }}>{F.j || "—"}</div><div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{dShort(f(s, "Date"))}</div></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{F.adv}</div>
        <div style={{ fontSize: 12, color: C.mut }}>{F.dom ? "à domicile" : "à l'extérieur"}{F.mt ? " · mi-temps " + F.mt[0] + "–" + F.mt[1] : ""}{(() => { const t = [...F.us].sort((a, b) => b.b - a.b)[0]; return t && t.b ? " · " + sheetName(t.n).split(" ").slice(-1)[0] + " " + t.b + " buts" : ""; })()}</div>
      </div>
      <div style={{ textAlign: "right", flex: "0 0 auto" }}><div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{F.s[0]}–{F.s[1]}</div><ResChip s={F.s} /></div>
    </button> : <div key={s.id} style={{ ...card, display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "#FAFAFB" }}>
      <div style={{ width: 52, textAlign: "center", fontSize: 13, fontWeight: 800, color: C.mut }}>{dShort(f(s, "Date"))}</div>
      <div style={{ flex: 1, fontSize: 13.5, color: C.mut }}><b style={{ color: C.text }}>{f(s, "Adversaire") || "Match"}</b> · feuille non importée</div>
      {onOpenSeance && <button className="btn btn-ghost" onClick={() => onOpenSeance(s.id)} style={{ minHeight: 34, fontSize: 12.5 }}><i className="ti ti-file-upload" aria-hidden="true" />Importer</button>}
    </div>)}
  </div>;
  else {
    const cols = [["m", "M"], ["b", "Buts"], ["moy", "Moy."], ["eff", "Effic."], ["b7", "7 m"], ["ar", "Arrêts"], ["m2", "2'"], ["av", "Avert."], ["best", "Record"]];
    const rows = [...table].sort((a, b) => sort === "nom" ? a.nom.localeCompare(b.nom, "fr") : ((b[sort] ?? -1) - (a[sort] ?? -1)) || b.b - a.b);
    body = <div style={{ ...card, padding: "8px 0" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 13.5, minWidth: 640 }}>
          <thead><tr>
            <th style={{ position: "sticky", left: 0, background: "#fff", zIndex: 1, textAlign: "left", padding: "8px 14px" }}><button onClick={() => setSort("nom")} style={{ border: "none", background: "none", fontFamily: "inherit", fontSize: 11.5, fontWeight: 800, letterSpacing: ".04em", color: sort === "nom" ? C.red : C.mut, cursor: "pointer", padding: 0 }}>JOUEUR</button></th>
            {cols.map(([k, l]) => <th key={k} style={{ textAlign: "right", padding: "8px 8px" }}><button onClick={() => setSort(k)} aria-pressed={sort === k} style={{ border: "none", background: sort === k ? "#FFF3E6" : "none", borderRadius: 8, fontFamily: "inherit", fontSize: 11.5, fontWeight: 800, letterSpacing: ".04em", color: sort === k ? C.red : C.mut, cursor: "pointer", padding: "3px 6px", whiteSpace: "nowrap" }}>{l.toUpperCase()}{sort === k ? " ↓" : ""}</button></th>)}
          </tr></thead>
          <tbody>{rows.map((p, i) => <tr key={p.key} onClick={() => p.id && setPlayer(p.id)} style={{ cursor: p.id ? "pointer" : "default" }}>
            <td style={{ position: "sticky", left: 0, background: "#fff", padding: "9px 14px", borderTop: "1px solid " + C.line, fontWeight: 700, whiteSpace: "nowrap", boxShadow: "2px 0 0 #F2F3F6" }}>{sort === "b" && i < 3 ? <Medal i={i} /> : null} {p.nom}{p.gk ? <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 800, padding: "1px 6px", borderRadius: 6, background: C.black, color: "#fff" }}>GB</span> : null}</td>
            <td style={{ textAlign: "right", padding: "9px 8px", borderTop: "1px solid " + C.line }}>{p.m}</td>
            <td style={{ textAlign: "right", padding: "9px 8px", borderTop: "1px solid " + C.line, fontWeight: 800, fontSize: 15 }}>{p.b}</td>
            <td style={{ textAlign: "right", padding: "9px 8px", borderTop: "1px solid " + C.line, color: C.mut }}>{r1(p.moy)}</td>
            <td style={{ textAlign: "right", padding: "9px 8px", borderTop: "1px solid " + C.line }}>{p.gk && !p.b ? "" : pctS(p.eff)}</td>
            <td style={{ textAlign: "right", padding: "9px 8px", borderTop: "1px solid " + C.line }}>{p.b7 || ""}</td>
            <td style={{ textAlign: "right", padding: "9px 8px", borderTop: "1px solid " + C.line, fontWeight: p.ar ? 800 : 400 }}>{p.ar || ""}</td>
            <td style={{ textAlign: "right", padding: "9px 8px", borderTop: "1px solid " + C.line, color: p.m2 >= 5 ? C.abs : C.text, fontWeight: p.m2 >= 5 ? 800 : 400 }}>{p.m2 || ""}</td>
            <td style={{ textAlign: "right", padding: "9px 8px", borderTop: "1px solid " + C.line }}>{p.av || ""}</td>
            <td style={{ textAlign: "right", padding: "9px 14px 9px 8px", borderTop: "1px solid " + C.line, whiteSpace: "nowrap", color: C.mut }}>{p.best ? <><b style={{ color: C.text }}>{p.best}</b> vs {p.bestAdv.split(" ")[0]}</> : ""}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div style={{ fontSize: 12, color: C.mut, padding: "10px 14px 4px", lineHeight: 1.5 }}>Touche un titre de colonne pour trier, un joueur pour ouvrir sa fiche. Efficacité = buts ÷ tirs, calculée seulement sur les feuilles où le nombre de tirs est cohérent.</div>
    </div>;
  }
  return <div className="fade" style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 1000 }}>
    {header}
    {body}
    {n > 0 && missing.length > 0 && !curM && tab !== "matchs" && <div style={{ fontSize: 12.5, color: C.mut }}>{missing.length} match{missing.length > 1 ? "s" : ""} pointé{missing.length > 1 ? "s" : ""} sans feuille importée : ils ne comptent pas dans ces stats.</div>}
  </div>;
}

// ------------------------------------------------------------------ Import d'une feuille (page plein écran depuis la fiche match)
export function FeuilleImport({ s, d, roster, call, onDone, onCancel }) {
  const [step, setStep] = useState("choix"); // choix → lecture → apercu → envoi
  const [err, setErr] = useState("");
  const [r, setR] = useState(null);
  const [usIdx, setUsIdx] = useState(0);
  const [map, setMap] = useState([]); // par joueur de la feuille : { id, how } ; id "new" = créer en renfort ; "skip" = ignorer
  const [current, setCurrent] = useState(null); // joueurs cochés actuellement (si la séance est déjà pointée)
  const [applyP, setApplyP] = useState(true);
  const [applyS, setApplyS] = useState(true);
  const [lock, setLock] = useState(false);
  const pointed = f(s, "Statut") === "Pointée";
  const appPlayers = d.players.map((p) => ({ id: p.id, nom: f(p, "Nom") || "", prenom: f(p, "Prénom") || "", licence: f(p, "Licence") || "" }));
  const rosterIds = new Set(roster.map((x) => x.p.id));
  useEffect(() => {
    call({ action: "etat", seanceId: s.id }).then((j) => { if (j && j.locked) setLock(true); }).catch(() => {});
    if (!pointed) { setCurrent(new Set()); return; }
    const ids = f(s, "Pointages") || [];
    if (!ids.length) { setCurrent(new Set()); return; }
    db({ action: "list", table: "Pointages", filterByFormula: "OR(" + ids.slice(0, 80).map((id) => "RECORD_ID()='" + id + "'").join(",") + ")" })
      .then((j) => setCurrent(new Set((j.records || []).filter((x) => f(x, "État") !== "Excusé").flatMap((x) => f(x, "Joueur") || []))), () => setCurrent(new Set()));
  }, [s.id]);
  const pick = async (file) => {
    if (!file) return;
    setErr(""); setStep("lecture");
    try {
      const res = await readFeuille(file);
      const ui = isUs(res.home) ? 0 : isUs(res.away) ? 1 : -1;
      if (ui < 0) throw new Error("Vitrolles n'apparaît pas sur cette feuille (" + res.home + " / " + res.away + ").");
      const inRoster = appPlayers.filter((p) => rosterIds.has(p.id));
      const m = res.teams[ui].players.map((p) => { const a = matchPlayer(p, inRoster); return a.id ? a : matchPlayer(p, appPlayers); });
      setR(res); setUsIdx(ui); setMap(m);
      const sc = ui === 0 ? res.score : [res.score[1], res.score[0]];
      setApplyS(!pointed || f(s, "Score VHB") == null || Number(f(s, "Score VHB")) !== sc[0] || Number(f(s, "Score adverse")) !== sc[1]);
      setStep("apercu");
    } catch (e) { setErr(e.message || "Lecture impossible."); setStep("choix"); }
  };
  const back = onCancel;
  const sheetPlayers = r ? r.teams[usIdx].players : [];
  const mapped = map.map((m) => m.id).filter((x) => x && x !== "new" && x !== "skip");
  const newSet = new Set(mapped);
  const diffAdd = current ? mapped.filter((x) => !current.has(x)) : [];
  const diffRem = current ? [...current].filter((x) => !newSet.has(x)) : [];
  const hasDiff = pointed && (diffAdd.length || diffRem.length || map.some((m) => m.id === "new"));
  useEffect(() => { if (current && r) setApplyP(!pointed || !!hasDiff); }, [!!current, !!r]);
  const nm = (id) => { const p = d.players.find((x) => x.id === id); return p ? ((f(p, "Prénom") || "") + " " + (f(p, "Nom") || "")).trim() : "?"; };
  const sc = r ? (usIdx === 0 ? r.score : [r.score[1], r.score[0]]) : [0, 0];
  const unresolved = map.filter((m) => !m.id).length;
  const go = async () => {
    setStep("envoi"); setErr("");
    try {
      const ids = [];
      for (let i = 0; i < sheetPlayers.length; i++) {
        let id = map[i].id;
        if (id === "new") {
          const sp = sheetPlayers[i]; const parts = sp.nom.split(" "); const up = parts.filter((x) => x === x.toUpperCase() && /[A-Z]/.test(x)); const lo = parts.filter((x) => !up.includes(x));
          const j = await call({ action: "addPlayer", seanceId: s.id, prenom: capName(lo.join(" ")) || "?", nom: capName(up.join(" ")) || sp.nom });
          id = j.joueurId;
        }
        ids.push(id && id !== "skip" ? id : null);
      }
      const F = buildStored(r, usIdx, ids, f(s, "Adversaire") || "");
      const j = await call({ action: "importSheet", seanceId: s.id, feuille: F, presents: ids.filter(Boolean), licences: ids.map((id, i) => id && { joueurId: id, licence: sheetPlayers[i].licence }).filter(Boolean), applyPresence: applyP && !lock, applyScore: applyS && !lock });
      onDone(j.locked ? "Feuille importée : stats enregistrées. Le mois de primes étant validé, présences et score n'ont pas été modifiés." : "Feuille de match importée.");
    } catch (e) { setErr(e.message || "Import impossible."); setStep("apercu"); }
  };
  const wrong = r && r.date && r.date !== f(s, "Date");
  return <div className="fade" style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 760, paddingBottom: 100 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <button className="btn btn-ghost" onClick={back} aria-label="Fermer l'import" style={{ padding: "8px 10px" }}><i className="ti ti-x" aria-hidden="true" /></button>
      <div style={{ fontSize: 18, fontWeight: 800, flex: 1 }}>Importer la feuille de match</div>
    </div>
    {(step === "choix" || step === "lecture") && <label style={{ ...card, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "30px 18px", border: "2px dashed #F0C49A", background: "#FFF8EF", cursor: "pointer", textAlign: "center" }}>
      <span aria-hidden="true" style={{ width: 60, height: 60, borderRadius: 30, background: C.orange, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}><i className={"ti " + (step === "lecture" ? "ti-loader-2" : "ti-file-type-pdf")} style={{ fontSize: 30 }} /></span>
      <span style={{ fontWeight: 800, fontSize: 16 }}>{step === "lecture" ? "Lecture de la feuille…" : "Choisir le PDF de la feuille de match"}</span>
      <span style={{ fontSize: 13, color: C.mut, maxWidth: 420 }}>La feuille officielle exportée de la table de marque (FFHB). L'appli lit le score, la mi-temps, les joueurs et leurs stats, puis te montre tout avant d'enregistrer.</span>
      <input type="file" accept="application/pdf,.pdf" disabled={step === "lecture"} onChange={(e) => pick(e.target.files && e.target.files[0])} style={{ position: "absolute", width: 1, height: 1, opacity: 0 }} />
    </label>}
    {err && <div role="alert" className="card" style={{ borderLeft: "4px solid " + C.abs, color: "#9E1B1B", fontWeight: 700 }}>{err}</div>}
    {r && (step === "apercu" || step === "envoi") && <>
      <div style={{ background: C.black, color: "#fff", borderRadius: 22, padding: "16px 18px", borderLeft: "6px solid " + C.yellow }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".06em", color: C.yellow }}>{[r.journee, r.date && dShort(r.date), (r.salle || "").split(/ (?:AVENUE|AV\.?|RUE|BD|BOULEVARD|CHEMIN|ROUTE|ALLEE|PLACE) /)[0]].filter(Boolean).join(" · ").toUpperCase()}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 6 }}>
          <span style={{ fontSize: 22, fontWeight: 800 }}>{(() => { const a = f(s, "Adversaire") || capName(usIdx === 0 ? r.away : r.home); return usIdx === 0 ? "VHB – " + a : a + " – VHB"; })()}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4, flexWrap: "wrap" }}><span style={{ fontSize: 38, fontWeight: 800 }}>{sc[0]} <span style={{ color: "#8A8F98" }}>–</span> {sc[1]}</span><ResChip s={sc} />{r.half && <span style={{ fontSize: 13, color: "#D5D8DD" }}>mi-temps {usIdx === 0 ? r.half[0] + "–" + r.half[1] : r.half[1] + "–" + r.half[0]}</span>}</div>
      </div>
      {wrong && <div className="card" style={{ borderLeft: "4px solid " + C.yellow, background: "#FFF8E5", fontSize: 13.5 }}><b>Attention :</b> la feuille est datée du {dShort(r.date)}, la séance du {dShort(f(s, "Date"))}. Vérifie que c'est le bon match.</div>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <span style={{ background: "#E7F4EA", color: "#1F5C30", fontSize: 12.5, fontWeight: 800, padding: "5px 11px", borderRadius: 14 }}>{map.filter((m) => m.id && m.id !== "new" && m.id !== "skip").length} joueur(s) reconnu(s)</span>
        {map.some((m) => m.how === "approché") && <span style={{ background: "#FFF3C4", color: "#6B4A00", fontSize: 12.5, fontWeight: 800, padding: "5px 11px", borderRadius: 14 }}>{map.filter((m) => m.how === "approché").length} à confirmer</span>}
        {unresolved > 0 && <span style={{ background: "#FDECEC", color: "#9E1B1B", fontSize: 12.5, fontWeight: 800, padding: "5px 11px", borderRadius: 14 }}>{unresolved} à choisir</span>}
      </div>
      <div style={{ ...card, padding: "8px 0" }}>
        {sheetPlayers.map((p, i) => { const m = map[i]; const st = !m.id ? "todo" : m.how === "approché" ? "check" : "ok";
          return <div key={p.licence} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderTop: i ? "1px solid " + C.line : "none", flexWrap: "wrap", background: st === "todo" ? "#FFF6F5" : st === "check" ? "#FFFBEA" : "transparent" }}>
            <span style={{ width: 28, fontWeight: 800, color: C.mut, fontSize: 12.5 }}>{p.num}</span>
            <span style={{ flex: "1 1 150px", minWidth: 0 }}><span style={{ display: "block", fontWeight: 800, fontSize: 13.5 }}>{p.nom}</span>
              <span style={{ fontSize: 12, color: C.mut }}>{[p.buts ? p.buts + " but" + (p.buts > 1 ? "s" : "") + (p.b7 ? " (" + p.b7 + " × 7 m)" : "") : null, p.arrets ? p.arrets + " arrêts" : null, p.m2 ? p.m2 + " × 2'" : null, p.av ? "averti" : null].filter(Boolean).join(" · ") || "—"}</span></span>
            <select className="sel" aria-label={"Joueur de l'appli pour " + p.nom} value={m.id || ""} onChange={(e) => { const v = e.target.value; setMap(map.map((x, k) => k === i ? { id: v || null, how: "choisi" } : x)); }} style={{ flex: "0 1 230px", minWidth: 0, minHeight: 38, fontWeight: 700, borderColor: st === "todo" ? "#F5C2C0" : st === "check" ? "#F0D98A" : undefined }}>
              <option value="">— Choisir le joueur —</option>
              <optgroup label="Effectif de l'équipe">{roster.map((x) => <option key={x.p.id} value={x.p.id}>{nm(x.p.id)}</option>)}</optgroup>
              <optgroup label="Autres joueurs du club">{d.players.filter((x) => !rosterIds.has(x.id)).sort((a, b) => nm(a.id).localeCompare(nm(b.id), "fr")).map((x) => <option key={x.id} value={x.id}>{nm(x.id)}</option>)}</optgroup>
              <option value="new">+ Nouveau joueur (ajouté en renfort à valider)</option>
              <option value="skip">Ignorer ce joueur</option>
            </select>
            {st === "ok" && <i className="ti ti-circle-check" aria-label="reconnu" style={{ color: C.green, fontSize: 20 }} />}
            {st === "check" && <span style={{ fontSize: 11.5, fontWeight: 800, color: "#6B4A00" }}>nom proche : vérifie</span>}
          </div>; })}
      </div>
      {lock ? <div className="card" style={{ borderLeft: "4px solid " + C.black, background: "#F4F5F8", fontSize: 13.5 }}><b>Mois de primes validé :</b> seules les stats seront enregistrées. Les présences et le score restent tels quels.</div>
        : <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14 }}><input type="checkbox" checked={applyP} onChange={(e) => setApplyP(e.target.checked)} style={{ width: 20, height: 20, marginTop: 1 }} />
            <span><b>{pointed ? "Remplacer le pointage par la feuille" : "Cocher les joueurs de la feuille"}</b> ({mapped.length + map.filter((m) => m.id === "new").length} joueurs)
              {pointed && current && (hasDiff ? <span style={{ display: "block", fontSize: 12.5, color: "#6B4A00", marginTop: 3 }}>Écarts avec le pointage actuel : {diffAdd.length ? "à cocher : " + diffAdd.map(nm).join(", ") : ""}{diffAdd.length && diffRem.length ? " · " : ""}{diffRem.length ? "à décocher : " + diffRem.map(nm).join(", ") : ""}{map.some((m) => m.id === "new") ? " · nouveaux joueurs" : ""}</span>
                : <span style={{ display: "block", fontSize: 12.5, color: "#1F5C30", marginTop: 3 }}>Le pointage actuel correspond déjà à la feuille.</span>)}</span></label>
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14 }}><input type="checkbox" checked={applyS} onChange={(e) => setApplyS(e.target.checked)} style={{ width: 20, height: 20, marginTop: 1 }} />
            <span><b>Mettre le score {sc[0]}–{sc[1]}</b> ({RES[resOf(sc)][0].toLowerCase()})
              {pointed && f(s, "Score VHB") != null && <span style={{ display: "block", fontSize: 12.5, color: C.mut, marginTop: 3 }}>Score actuel : {f(s, "Score VHB")}–{f(s, "Score adverse")}{f(s, "Résultat") ? " (" + f(s, "Résultat") + ")" : ""}. Laisse décoché pour garder un résultat saisi à la main (ex. nul compté comme victoire).</span>}</span></label>
        </div>}
      <div style={{ position: "sticky", bottom: "calc(74px + env(safe-area-inset-bottom))", zIndex: 5 }}>
        <button className="btn btn-red" disabled={step === "envoi" || unresolved > 0} onClick={go} style={{ width: "100%", justifyContent: "center", minHeight: 56, fontSize: 16, fontWeight: 800 }}>
          <i className="ti ti-file-check" aria-hidden="true" />{step === "envoi" ? "Import en cours…" : unresolved > 0 ? "Choisis les " + unresolved + " joueur(s) non reconnu(s)" : "Importer la feuille"}
        </button>
      </div>
    </>}
  </div>;
}

// Petit bloc pour la fiche match quand la feuille est importée.
export function MatchSheetSummary({ F, d, onOpen }) {
  const top = [...F.us].filter((p) => p.b).sort((a, b) => b.b - a.b).slice(0, 3);
  const gk = F.us.filter((p) => p.ar).sort((a, b) => b.ar - a.ar);
  const nameOf = (p) => { const pl = p.id && d.players.find((x) => x.id === p.id); return pl ? ((f(pl, "Prénom") || "") + " " + (f(pl, "Nom") || "")).trim() : sheetName(p.n); };
  return <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10, borderLeft: "4px solid " + C.orange }}>
    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}><span style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".06em", color: C.mut, flex: 1 }}>STATS DE LA FEUILLE{F.mt ? " · MI-TEMPS " + F.mt[0] + "–" + F.mt[1] : ""}</span>
      <button className="btn btn-ghost" onClick={onOpen} style={{ minHeight: 32, fontSize: 12.5 }}><i className="ti ti-chart-bar" aria-hidden="true" />Analyse du match</button></div>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {top.map((p, i) => <span key={p.n} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: i === 0 ? "#FFF3C4" : "#F4F5F8", borderRadius: 14, padding: "6px 11px", fontSize: 13, fontWeight: 700 }}><i className="ti ti-ball-football" aria-hidden="true" />{nameOf(p)} <b>{p.b}</b></span>)}
      {gk.map((p) => <span key={p.n} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#F4F5F8", borderRadius: 14, padding: "6px 11px", fontSize: 13, fontWeight: 700 }}><span style={{ fontSize: 10.5, fontWeight: 800, padding: "1px 5px", borderRadius: 5, background: C.black, color: "#fff" }}>GB</span>{nameOf(p)} <b>{p.ar} arrêts</b></span>)}
    </div>
  </div>;
}
