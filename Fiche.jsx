// Étape 5 — Fiche joueur et assiduité de toutes les équipes.
import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { printReleve } from "./Primes.jsx";
import { f, RED, YELLOW, BLACK, TEXT, MUT, BORDER, OK } from "./App.jsx";

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
const ETAT = { "Présent": ["#E7F4EA", "#1F5C30"], "Excusé": ["#FFF6D6", "#6B4A00"], "Absent": ["#FDECEC", "#9E1B1B"] };

// ---------------------------------------------------------------------------- Fiche joueur (plein écran)
export function PlayerCard({ joueurId, onClose }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => { api({ action: "fiche", joueurId }).then((x) => (x && x.joueur ? setD(x) : setErr("Fiche indisponible pour le moment."))).catch((e) => setErr(e.message)); }, [joueurId]);
  useEffect(() => { const h = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);
  const initials = d ? ((d.joueur.prenom[0] || "") + (d.joueur.nom[0] || "")).toUpperCase() : "";
  return createPortal(<div role="dialog" aria-modal="true" aria-label="Fiche joueur" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, background: "rgba(16,17,20,.55)", zIndex: 210, display: "flex", justifyContent: "center", alignItems: "flex-start", overflowY: "auto", padding: "calc(12px + env(safe-area-inset-top)) 12px 40px" }}>
    <div className="card" style={{ position: "relative", width: "100%", maxWidth: 760, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ position: "sticky", top: 0, alignSelf: "flex-end", height: 0, zIndex: 3 }}><button aria-label="Fermer" onClick={onClose} style={{ position: "relative", top: -4, right: -6, boxShadow: "0 2px 8px rgba(0,0,0,.12)", width: 40, height: 40, borderRadius: 20, border: "none", background: "#EEF0F3", cursor: "pointer", fontSize: 22, lineHeight: 1 }}><span aria-hidden="true">×</span></button></div>
      {err && <div style={{ color: "#9E1B1B", paddingRight: 48 }}>{err}</div>}
      {!d && !err && <div style={{ color: MUT }}>Chargement de la fiche…</div>}
      {d && <>
        <div style={{ display: "flex", alignItems: "center", gap: 14, paddingRight: 48 }}>
          <span style={{ width: 56, height: 56, borderRadius: 28, background: BLACK, color: YELLOW, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 20, flex: "0 0 auto" }}>{initials}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 21, fontWeight: 800, color: TEXT }}>{d.joueur.prenom} {d.joueur.nom}</div>
            <div style={{ fontSize: 13, color: MUT }}>{["Saison " + d.saison, d.joueur.annee ? "né en " + d.joueur.annee : null, d.joueur.licence ? "licence " + d.joueur.licence : null].filter(Boolean).join(" · ")}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              {d.teams.map((t) => <Chip key={t.teamId} bg={t.effectifs.some((e) => e.statut === "Renfort") ? "#FFF6D6" : "#EEF0F3"} fg={t.effectifs.some((e) => e.statut === "Renfort") ? "#6B4A00" : "#3A3F47"}>{t.nom} · {t.effectifs.map((e) => e.statut + (e.entree ? " depuis le " + new Date(e.entree + "T12:00:00").toLocaleDateString("fr-FR") : "") + (e.sortie ? " jusqu'au " + new Date(e.sortie + "T12:00:00").toLocaleDateString("fr-FR") : "")).join(", ")}</Chip>)}
            </div>
          </div>
        </div>

        {d.teams.map((t) => {
          const ms = t.months.filter((m) => m.seances || m.moyenne != null);
          const tot = t.months.reduce((a, m) => ({ s: a.s + m.seances, p: a.p + m.presences, e: a.e + m.entrainements, mt: a.mt + m.matchs }), { s: 0, p: 0, e: 0, mt: 0 });
          return <div key={t.teamId} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".06em", color: MUT }}>ASSIDUITÉ · {t.nom.toUpperCase()}</span>
              <span style={{ fontSize: 13, color: TEXT }}><b>{tot.p}/{tot.s}</b> séances sur la saison · {pct(tot.s ? tot.p / tot.s : null)} · {tot.e} entraînement(s), {tot.mt} match(s)</span>
            </div>
            {!ms.length && <div style={{ fontSize: 13, color: MUT }}>Aucune séance pointée pour l'instant.</div>}
            {ms.length > 0 && <div role="img" aria-label="Assiduité par mois comparée à la moyenne de l'équipe" style={{ display: "flex", gap: 10, alignItems: "flex-end", overflowX: "auto", padding: "4px 2px" }}>
              {ms.map((m) => <div key={m.month} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 54 }}>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: TEXT }}>{pct(m.taux)}</span>
                <div style={{ position: "relative", width: 34, height: 96, background: "#F1F2F5", borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: (m.taux || 0) * 100 + "%", background: rateTone(m.taux), borderRadius: 8 }} />
                  {m.moyenne != null && <div title={"Moyenne de l'équipe : " + pct(m.moyenne)} style={{ position: "absolute", left: -3, right: -3, bottom: "calc(" + m.moyenne * 100 + "% - 1px)", height: 2, background: BLACK }} />}
                </div>
                <span style={{ fontSize: 12, color: MUT, textTransform: "capitalize" }}>{mShort(m.month)}</span>
                <span style={{ fontSize: 11, color: MUT }}>{m.presences}/{m.seances}{m.excuses ? " · " + m.excuses + " exc." : ""}</span>
              </div>)}
            </div>}
            {ms.length > 0 && <div style={{ fontSize: 12, color: MUT, display: "flex", gap: 6, alignItems: "center" }}><span style={{ display: "inline-block", width: 14, height: 2, background: BLACK }} />trait noir : moyenne de l'équipe sur le mois</div>}
          </div>;
        })}

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".06em", color: MUT }}>DERNIÈRES SÉANCES</div>
          {!d.recent.length && <div style={{ fontSize: 13, color: MUT }}>Aucune séance pointée.</div>}
          {d.recent.map((s) => <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "#F7F8FA", borderRadius: 12 }}>
            <i className={"ti " + (s.type === "Match" ? "ti-trophy" : "ti-run")} aria-hidden="true" style={{ color: s.type === "Match" ? RED : MUT }} />
            <span style={{ flex: 1, fontSize: 13.5, minWidth: 0 }}><b>{fmtDate(s.date)}</b> · {s.type === "Match" ? "Match" + (s.adversaire ? " vs " + s.adversaire : "") + (s.score ? " · " + s.score : "") + (s.resultat ? " · " + s.resultat : "") : s.type}{d.teams.length > 1 ? " · " + s.equipe : ""}</span>
            <Chip bg={ETAT[s.etat][0]} fg={ETAT[s.etat][1]}>{s.etat}</Chip>
          </div>)}
        </div>

        {d.primes && <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".06em", color: MUT }}>PRIMES</span>
            {d.primes.length > 0 && d.teams.filter((t) => t.primes).map((t) => <button key={t.teamId} className="btn btn-ghost" style={{ minHeight: 32, padding: "0 10px", fontSize: 12.5, marginLeft: "auto", order: 2 }} onClick={async () => {
              const w = window.open("", "_blank"); // ouvert tout de suite, sinon le téléphone bloque la page
              if (w) w.document.write("<p style='font-family:Arial;margin:24px'>Préparation du relevé…</p>");
              try {
                const r = await fetch("/api/primes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "annual", teamId: t.teamId, season: Number(d.saison.slice(0, 4)) }) });
                const j = await r.json(); if (!r.ok) throw new Error(j.error || "Erreur");
                const pl = j.players.filter((x) => x.joueur === joueurId);
                if (!pl.length) { if (w) w.close(); alert("Aucune prime validée cette saison pour ce joueur."); return; }
                if (w) { w.document.open(); }
                printReleve({ team: j.team.nom, season: j.season, players: pl, months: j.months, win: w });
              } catch (e) { if (w) w.close(); alert(e.message); }
            }}><i className="ti ti-printer" aria-hidden="true" />Relevé annuel{d.teams.filter((x) => x.primes).length > 1 ? " · " + t.nom : ""}</button>)}
            {d.primes.length > 0 && <span style={{ fontSize: 13 }}>Saison : <b>{eur(d.primes.filter((l) => l.valide).reduce((t, l) => t + l.montant, 0))}</b> validés · dont {eur(d.primes.filter((l) => l.paiement === "Payé").reduce((t, l) => t + l.montant, 0))} payés</span>}
          </div>
          {!d.primes.length && <div style={{ fontSize: 13, color: MUT }}>Aucune prime validée pour l'instant (le mois en cours se voit dans Sportif › Primes).</div>}
          {d.primes.map((l) => { const tone = l.paiement === "Payé" ? ["#E7F4EA", "#1F5C30"] : l.paiement === "Mis en paiement" ? ["#FFF6D6", "#6B4A00"] : ["#FDECEC", "#9E1B1B"]; return <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "#F7F8FA", borderRadius: 12 }}>
            <span style={{ flex: 1, fontSize: 13.5 }}><b style={{ textTransform: "capitalize" }}>{mLong(l.periode)}</b> · {l.type}{l.motif ? " · " + l.motif : ""}</span>
            <b style={{ color: l.montant < 0 ? "#9E1B1B" : TEXT }}>{eur(l.montant)}</b>
            <Chip bg={l.valide ? tone[0] : "#EEF0F3"} fg={l.valide ? tone[1] : MUT}>{l.valide ? l.paiement : "Mois ouvert"}</Chip>
          </div>; })}
        </div>}
      </>}
    </div>
  </div>, document.body);
}

// ---------------------------------------------------------------------------- Onglet Joueurs (toutes les équipes)
export function RosterView({ teams, efx, players, initialTeam }) {
  const [teamId, setTeamId] = useState(() => initialTeam || (teams[0] || {}).id);
  const [month, setMonth] = useState(thisMonth);
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("nom");
  const [open, setOpen] = useState(null);
  const load = useCallback(async () => {
    if (!teamId) return; setErr(""); setData(null);
    try { setData(await api({ action: "assiduite", teamId, month })); } catch (e) { setErr(e.message); }
  }, [teamId, month]);
  useEffect(() => { load(); }, [load]);
  if (!teams.length) return <div className="card" style={{ color: MUT }}>Aucune équipe.</div>;
  // Effectif actuel de l'équipe (même les joueurs sans séance ce mois-ci).
  const today = new Date().toISOString().slice(0, 10);
  const roster = efx.filter((e) => (f(e, "Équipe") || []).includes(teamId) && (!f(e, "Sortie") || f(e, "Sortie") >= month + "-01"))
    .map((e) => { const p = players.find((x) => x.id === (f(e, "Joueur") || [])[0]); return p && { id: p.id, nom: ((f(p, "Prénom") || "") + " " + (f(p, "Nom") || "")).trim(), tri: norm(f(p, "Nom")) + " " + norm(f(p, "Prénom")), statut: f(e, "Statut") || "Effectif", futur: f(e, "Entrée") && f(e, "Entrée") > today }; })
    .filter(Boolean);
  const seen = new Set(); const rows = roster.filter((r) => !seen.has(r.id) && seen.add(r.id))
    .map((r) => ({ ...r, a: data && data.lines.find((l) => l.joueur === r.id) }))
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
    </div>
    {c && <div className="card" style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", padding: "12px 14px", fontSize: 13.5 }}>
      <span><b>{c.entrainements}</b> entraînement(s)</span><span><b>{c.matchs}</b> match(s)</span><span><b>{c.annulees}</b> annulée(s)</span>
      {c.aPointer > 0 && <span style={{ color: "#9E1B1B", fontWeight: 800 }}>{c.aPointer} à pointer</span>}
      <span style={{ marginLeft: "auto" }}>Présence moyenne : <b>{c.comptees ? pct(data.tauxMoyen) : "—"}</b></span>
    </div>}
    {err && <div className="card" style={{ color: "#9E1B1B" }}>{err}</div>}
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <input className="inp" aria-label="Rechercher un joueur" placeholder="Rechercher un joueur…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: "1 1 180px", width: "auto", minWidth: 0 }} />
      <select className="sel" aria-label="Trier" value={sort} onChange={(e) => setSort(e.target.value)} style={{ width: "auto", flex: "0 0 auto" }}><option value="nom">Par nom</option><option value="taux">Moins présents</option></select>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map((r) => <button key={r.id} className="card" onClick={() => setOpen(r.id)} style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left", border: "none", cursor: "pointer", fontFamily: "inherit", padding: "12px 14px" }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontWeight: 800, fontSize: 15 }}>{r.nom}</span>
          <span style={{ display: "block", fontSize: 12.5, color: MUT }}>{r.statut}{r.futur ? " · arrive bientôt" : ""}{r.a ? " · " + r.a.presences + "/" + r.a.seances + " séances" + (r.a.excuses ? " · " + r.a.excuses + " excusée(s)" : "") : data ? " · pas de séance ce mois-ci" : ""}</span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 64, height: 8, borderRadius: 4, background: "#EEF0F3", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: (r.a && r.a.seances ? r.a.taux * 100 : 0) + "%", background: rateTone(r.a && r.a.seances ? r.a.taux : null) }} /></span>
          <b style={{ minWidth: 44, textAlign: "right" }}>{r.a && r.a.seances ? pct(r.a.taux) : "—"}</b>
        </span>
      </button>)}
      {!rows.length && <div className="card" style={{ color: MUT }}>{q ? "Aucun joueur ne correspond." : "Aucun joueur dans cette équipe. Les effectifs se gèrent dans Admin › Équipes."}</div>}
    </div>
    <div style={{ fontSize: 12.5, color: MUT }}>Touche un joueur pour ouvrir sa fiche : assiduité de la saison, dernières séances{" "}et primes pour les personnes qui y ont accès.</div>
    {open && <PlayerCard joueurId={open} onClose={() => setOpen(null)} />}
  </div>;
}
