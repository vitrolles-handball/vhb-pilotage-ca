// ===========================================================================
// ESPACE SPORTIF — VHB Team
//  • Aujourd'hui : séances du jour de toutes ses équipes, séances en retard, la semaine
//  • Pointage : tout le monde présent par défaut, on touche les absents, on valide
//  • Match : feuille de match (joueurs cochés), score → victoire déduite
//  • Séance supplémentaire / stage, annulation avec motif
//  • Hors ligne : les pointages attendent sur le téléphone et partent au retour du réseau
// ===========================================================================
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { PrimesView } from "./Primes.jsx";
import { RosterView } from "./Fiche.jsx";
import { TeamManager, SAISON } from "./Admin.jsx";
import { Sheet } from "./Comms.jsx";
import { db, dbForget, f, RED, YELLOW, BLACK, TEXT, MUT, BORDER, OK } from "./App.jsx";

const QUEUE_KEY = "vhb_pointage_attente";
const SNAP_KEY = "vhb_sport_cache";
const ymd = (d) => { const x = new Date(d); return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0"); };
const addDays = (s, n) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return ymd(d); };
const TODAY = () => ymd(new Date());
const JOURS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const dayLabel = (s) => { const d = new Date(s + "T12:00:00"); return JOURS[d.getDay()] + " " + d.getDate() + " " + MOIS[d.getMonth()]; };
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const has = (rights, r) => (rights || []).includes("*") || (rights || []).includes(r);
const canManage = (r) => ["eff", "users", "plan", "param"].some((x) => has(r, x));
const canPrimesR = (r) => ["corr", "valid", "param", "compta"].some((x) => has(r, x));
const TYPE_ICON = { "Entraînement": "ti-run", "Match": "ti-trophy", "Entraînement supplémentaire": "ti-plus", "Stage": "ti-tent" };

// ---------------------------------------------------------------- File d'attente hors ligne
const readQueue = () => { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); } catch (e) { return []; } };
const writeQueue = (q) => { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch (e) {} window.dispatchEvent(new Event("vhb-queue")); };
async function callPointage(payload) {
  dbForget("Séances"); dbForget("Pointages");
  const r = await fetch("/api/pointage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).finally(() => { dbForget("Séances"); dbForget("Pointages"); });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) window.dispatchEvent(new Event("vhb-auth-lost"));
  if (!r.ok) { const e = new Error(j.error || ("Erreur " + r.status)); e.status = r.status; throw e; }
  return j;
}
// Envoie ce qui attend. Renvoie le nombre d'envois réussis.
export async function flushQueue() {
  let q = readQueue(); if (!q.length) return 0;
  let sent = 0; const keep = [];
  for (const item of q) {
    try { await callPointage(item); sent++; }
    catch (e) { if (!e.status || e.status >= 500) keep.push(item); /* erreur définitive (droits…) : on abandonne */ }
  }
  writeQueue(keep);
  return sent;
}
function useQueueCount() {
  const [n, setN] = useState(readQueue().length);
  useEffect(() => {
    const h = () => setN(readQueue().length);
    const online = () => { flushQueue().then(h); };
    window.addEventListener("vhb-queue", h); window.addEventListener("online", online);
    online();
    return () => { window.removeEventListener("vhb-queue", h); window.removeEventListener("online", online); };
  }, []);
  return n;
}

// ---------------------------------------------------------------- Données
function useSportData(me, rights, scope, teams) {
  // Au démarrage, on affiche la dernière copie connue (utile au gymnase sans réseau), puis on recharge.
  const [d, setD] = useState(() => { try { const c = JSON.parse(localStorage.getItem(SNAP_KEY) || "null"); if (c && c.uid === me.id) return { ...c, loaded: true, offline: true }; } catch (e) {} return { loaded: false }; });
  const load = useCallback(async () => {
    try {
      const from = addDays(TODAY(), -45), to = addDays(TODAY(), 60);
      const [t, e, p, s] = await Promise.all([
        db({ action: "list", table: "Équipes" }),
        db({ action: "list", table: "Effectifs" }),
        db({ action: "list", table: "Joueurs" }),
        db({ action: "list", table: "Séances", filterByFormula: "AND(IS_AFTER({Date}, '" + addDays(from, -1) + "'), IS_BEFORE({Date}, '" + addDays(to, 1) + "'))" }),
      ]);
      const mine = scope === "all" ? null : new Set(teams || []);
      const allTeams = (t.records || []).filter((x) => !f(x, "Archivée")).sort((a, b) => (f(a, "Ordre") || 99) - (f(b, "Ordre") || 99));
      const snap = {
        uid: me.id,
        teams: mine ? allTeams.filter((x) => mine.has(x.id)) : allTeams,
        efx: e.records || [], players: p.records || [], seances: s.records || [], at: Date.now(),
      };
      try { localStorage.setItem(SNAP_KEY, JSON.stringify(snap)); } catch (er) {}
      setD({ ...snap, loaded: true, offline: false });
    } catch (er) { setD((x) => ({ ...(x || {}), loaded: true, offline: true, error: er.message })); }
  }, [me.id, scope, (teams || []).join(",")]);
  useEffect(() => { load(); }, [load]);
  return [d, load];
}
const teamOf = (s) => (f(s, "Équipe") || [])[0];
const rosterAt = (d, teamId, date) => d.efx
  .filter((e) => (f(e, "Équipe") || []).includes(teamId) && (!f(e, "Entrée") || f(e, "Entrée") <= date) && (!f(e, "Sortie") || f(e, "Sortie") >= date))
  .map((e) => ({ e, p: d.players.find((p) => p.id === (f(e, "Joueur") || [])[0]) }))
  .filter((x) => x.p)
  .sort((a, b) => norm(f(a.p, "Nom")).localeCompare(norm(f(b.p, "Nom"))) || norm(f(a.p, "Prénom")).localeCompare(norm(f(b.p, "Prénom"))));
const pName = (p) => ((f(p, "Prénom") || "") + " " + (f(p, "Nom") || "")).trim();
const initials = (p) => (((f(p, "Prénom") || "")[0] || "") + ((f(p, "Nom") || "")[0] || "")).toUpperCase();

// ---------------------------------------------------------------- Espace
export default function SportSpace({ me, rights, scope, teams, view, setView }) {
  const [d, reload] = useSportData(me, rights, scope, teams);
  const club = scope === "all"; // vue de supervision : synthèse du club, puis détail par équipe
  const [open, setOpen] = useState(null); // { seanceId } | { create: "Match" | "Supp" }
  const [manage, setManage] = useState(null); // équipe ouverte dans « Gérer l'équipe »
  const [filter, setFilter] = useState("all");
  const queued = useQueueCount();
  if (!d.loaded) return <div className="card fade" style={{ color: MUT }}>Chargement de tes équipes…</div>;
  if (!d.teams || !d.teams.length) return <div className="card fade" style={{ borderLeft: "4px solid " + YELLOW, maxWidth: 560 }}><div style={{ fontSize: 17, fontWeight: 800, marginBottom: 6 }}>Aucune équipe pour l'instant</div><div style={{ fontSize: 13.5, color: MUT, lineHeight: 1.55 }}>Tu n'es rattaché à aucune équipe. Demande à un responsable de te rattacher à la tienne (Admin › Utilisateurs › ta fiche).</div></div>;
  const pick = filter !== "all" ? filter : null;
  if (view === "primes") return <PrimesView key={"p" + (pick || "")} rights={rights} teams={d.teams} initialTeam={pick} />;
  if (view === "joueurs") return <RosterView key={"r" + (pick || "")} teams={d.teams} efx={d.efx} players={d.players} initialTeam={pick} />;
  const banner = (d.offline || queued > 0) && <div role="status" style={{ background: "#FFF6D6", color: "#5C4600", borderRadius: 14, padding: "10px 14px", fontSize: 13, fontWeight: 700, display: "flex", gap: 8, alignItems: "center" }}>
    <i className="ti ti-wifi-off" aria-hidden="true" />
    {queued > 0 ? queued + " pointage(s) enregistré(s) sur le téléphone : envoi automatique dès le retour du réseau." : "Pas de réseau : tu vois les données de ta dernière connexion."}
  </div>;
  if (open) {
    const done = async (msg) => { setOpen(null); await reload(); if (msg) setTimeout(() => alert(msg), 50); };
    if (open.create) return <CreateSeance kind={open.create} d={d} me={me} onCancel={() => setOpen(null)} onCreated={(id) => { reload().then(() => setOpen({ seanceId: id })); }} />;
    const s = d.seances.find((x) => x.id === open.seanceId);
    if (!s) return <div className="card">Séance introuvable. <button className="btn btn-ghost" onClick={() => setOpen(null)}>Retour</button></div>;
    return <PointageView s={s} d={d} me={me} rights={rights} onBack={() => setOpen(null)} onDone={done} />;
  }
  const visTeams = filter === "all" ? d.teams.map((t) => t.id) : [filter];
  const mineS = d.seances.filter((s) => visTeams.includes(teamOf(s)));
  const today = TODAY();
  const late = mineS.filter((s) => f(s, "Statut") !== "Pointée" && f(s, "Statut") !== "Annulée" && f(s, "Date") < today).sort((a, b) => String(f(a, "Date")).localeCompare(String(f(b, "Date"))));
  const todays = mineS.filter((s) => f(s, "Date") === today).sort((a, b) => String(f(a, "Heure")).localeCompare(String(f(b, "Heure"))));
  const week = mineS.filter((s) => f(s, "Date") > today && f(s, "Date") <= addDays(today, 7)).sort((a, b) => (String(f(a, "Date")) + f(a, "Heure")).localeCompare(String(f(b, "Date")) + f(b, "Heure")));
  const tName = (id) => f(d.teams.find((t) => t.id === id), "Nom") || "";
  const tShort = (id) => tName(id).split("·")[0].trim();
  const month = today.slice(0, 7);
  const rate = (() => {
    const done = mineS.filter((s) => f(s, "Statut") === "Pointée" && String(f(s, "Date")).startsWith(month));
    let pres = 0, tot = 0;
    done.forEach((s) => { const n = rosterAt(d, teamOf(s), f(s, "Date")).length; tot += n; pres += (f(s, "Pointages") || []).length; });
    return tot ? Math.round(pres / tot * 100) + " %" : "—";
  })();
  const nextMatch = mineS.filter((s) => f(s, "Type") === "Match" && f(s, "Date") >= today && f(s, "Statut") !== "Annulée").sort((a, b) => String(f(a, "Date")).localeCompare(String(f(b, "Date"))))[0];

  if (view === "seances") return <SeancesList d={d} mineS={mineS} tName={tName} filter={filter} setFilter={setFilter} onOpen={(id) => setOpen({ seanceId: id })} banner={banner} />;
  const manageUI = manage && <TeamManager teamId={manage} rights={rights} onClose={() => { setManage(null); ["Équipes", "Staff", "Effectifs", "Rythmes", "Séances", "Joueurs"].forEach((x) => dbForget(x)); reload(); }} />;
  if (club && filter === "all") return <><ClubView d={d} banner={banner} rights={rights} onManage={setManage} onCreated={async (id) => { dbForget("Équipes"); await reload(); setManage(id); }} onTeam={(id) => { setFilter(id); window.scrollTo(0, 0); }} onOpen={(id) => setOpen({ seanceId: id })} />{manageUI}</>;
  const curTeam = club && d.teams.find((t) => t.id === filter);
  return (
    <div className="fade" style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 720 }}>
      {banner}
      {curTeam && <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <button className="btn btn-ghost" onClick={() => { setFilter("all"); window.scrollTo(0, 0); }} style={{ alignSelf: "flex-start" }}><span aria-hidden="true">‹</span> Vue club</button>
        <div style={{ fontSize: 22, fontWeight: 800, color: TEXT }}>{f(curTeam, "Nom")}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-ghost" onClick={() => setView("seances")}><i className="ti ti-calendar" aria-hidden="true" />Séances</button>
          <button className="btn btn-ghost" onClick={() => setView("joueurs")}><i className="ti ti-users" aria-hidden="true" />Joueurs et assiduité</button>
          {canPrimesR(rights) && f(curTeam, "Primes actives") && <button className="btn btn-ghost" onClick={() => setView("primes")}><i className="ti ti-coin-euro" aria-hidden="true" />Primes</button>}
          {canManage(rights) && <button className="btn btn-dark" onClick={() => setManage(curTeam.id)}><i className="ti ti-settings" aria-hidden="true" />Gérer l'équipe</button>}
        </div>
        {canManage(rights) && <div style={{ fontSize: 12.5, color: MUT }}>« Gérer l'équipe » : entraîneurs (avec invitation), joueurs, rythme d'entraînement{has(rights, "param") ? ", primes" : ""}.</div>}
      </div>}
      {manageUI}
      {!club && d.teams.length > 1 && <div role="group" aria-label="Filtrer par équipe" style={{ display: "flex", gap: 4, background: "#E9EBEF", borderRadius: 30, padding: 4, alignSelf: "flex-start", flexWrap: "wrap" }}>
        {[["all", "Toutes"]].concat(d.teams.map((t) => [t.id, tShort(t.id)])).map(([k, l]) => <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)} style={{ minHeight: 36, padding: "0 14px", border: "none", borderRadius: 30, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 800, background: filter === k ? BLACK : "transparent", color: filter === k ? "#fff" : "#3A3F47" }}>{l}</button>)}
      </div>}
      {late.length > 0 && <button onClick={() => setOpen({ seanceId: late[0].id })} className="card" style={{ textAlign: "left", cursor: "pointer", fontFamily: "inherit", borderLeft: "4px solid " + RED, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".06em", color: "#B42318" }}>À POINTER · {late.length} EN RETARD</div>
          {late.slice(0, 3).map((s) => <div key={s.id} style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{tShort(teamOf(s))} · {dayLabel(f(s, "Date"))} · {f(s, "Type") === "Match" ? "Match" : "Entraînement"}</div>)}
          {late.length > 3 && <div style={{ fontSize: 12.5, color: MUT }}>… et {late.length - 3} autre(s) dans « Séances »</div>}
        </div>
        <i className="ti ti-chevron-right" style={{ color: "#B42318", fontSize: 20 }} aria-hidden="true" />
      </button>}
      <div style={{ fontSize: 14, fontWeight: 800, color: "#3A3F47", padding: "4px 4px 0" }}>Aujourd'hui</div>
      {todays.map((s) => <SeanceBanner key={s.id} s={s} team={tShort(teamOf(s))} n={rosterAt(d, teamOf(s), today).length} onClick={() => setOpen({ seanceId: s.id })} />)}
      {!todays.length && <div className="card" style={{ fontSize: 13.5, color: MUT }}>Pas de séance prévue aujourd'hui.</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
        <div className="card" style={{ borderLeft: "4px solid " + RED }}><div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".06em", color: MUT }}>PRÉSENCE DU MOIS</div><div style={{ fontSize: 28, fontWeight: 800, color: "#C21F1F" }}>{rate}</div><div style={{ fontSize: 12.5, color: MUT }}>{filter === "all" && d.teams.length > 1 ? "sur tes " + d.teams.length + " équipes" : "séances pointées"}</div></div>
        <div className="card" style={{ borderLeft: "4px solid " + YELLOW }}><div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".06em", color: MUT }}>PROCHAIN MATCH</div>{nextMatch ? <><div style={{ fontSize: 16, fontWeight: 800 }}>{dayLabel(f(nextMatch, "Date"))}</div><div style={{ fontSize: 12.5, color: MUT }}>{tShort(teamOf(nextMatch))}{f(nextMatch, "Adversaire") ? " · vs " + f(nextMatch, "Adversaire") : ""}{f(nextMatch, "Heure") ? " · " + f(nextMatch, "Heure") : ""}</div></> : <div style={{ fontSize: 13.5, color: MUT, marginTop: 4 }}>Aucun match prévu</div>}</div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn btn-red" onClick={() => setOpen({ create: "Match" })}><i className="ti ti-trophy" aria-hidden="true" />Nouveau match</button>
        <button className="btn btn-ghost" onClick={() => setOpen({ create: "Supp" })}><i className="ti ti-plus" aria-hidden="true" />Séance supplémentaire</button>
      </div>
      <div style={{ fontSize: 14, fontWeight: 800, color: "#3A3F47", padding: "4px 4px 0" }}>Les 7 prochains jours</div>
      <div className="card" style={{ padding: 0 }}>
        {week.map((s) => <button key={s.id} onClick={() => setOpen({ seanceId: s.id })} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", border: "none", borderBottom: "1px solid #F0F1F4", background: "#fff", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
          <span style={{ fontSize: 11, fontWeight: 800, padding: "4px 8px", borderRadius: 10, background: "#F4F5F8", minWidth: 34, textAlign: "center" }}>{tShort(teamOf(s))}</span>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: TEXT }}>{dayLabel(f(s, "Date"))} · {f(s, "Type")}{f(s, "Adversaire") ? " vs " + f(s, "Adversaire") : ""}{f(s, "Statut") === "Annulée" ? " (annulée)" : ""}</span>
          <span style={{ fontSize: 13, color: MUT }}>{f(s, "Heure") || ""}</span>
        </button>)}
        {!week.length && <div style={{ fontSize: 13.5, color: MUT, padding: 14 }}>Rien de prévu cette semaine. Le planning se prépare dans Admin › Équipes › Rythme d'entraînement.</div>}
      </div>
      <ProposeSujet />
    </div>
  );
}

// ---------------------------------------------------------------- Proposer un sujet au CA (depuis l'espace Sportif)
const THEMES_CA = ["Sportif", "Finances", "Événements", "Bénévoles", "Communication", "Administratif", "Partenariats", "Divers"];
function ProposeSujet() {
  const [open, setOpen] = useState(false);
  const [titre, setTitre] = useState("");
  const [texte, setTexte] = useState("");
  const [theme, setTheme] = useState("Sportif");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const send = async () => {
    if (!titre.trim()) { alert("Donne un titre à ton sujet."); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sujet", titre, texte, theme }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Erreur " + r.status);
      setDone("Merci ! Ton sujet « " + titre.trim() + " » est transmis au CA" + (j.notified ? " (" + j.notified + " membre(s) prévenu(s))" : "") + ".");
      setTitre(""); setTexte(""); setTheme("Sportif");
    } catch (e) { alert(e.message); }
    setBusy(false);
  };
  return <>
    <button onClick={() => { setOpen(true); setDone(""); }} className="card" style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", fontFamily: "inherit", textAlign: "left", borderLeft: "4px solid " + YELLOW, marginTop: 4 }}>
      <i className="ti ti-bulb" aria-hidden="true" style={{ fontSize: 22, color: "#B5660A" }} />
      <span style={{ flex: 1 }}><b style={{ display: "block", fontSize: 14.5, color: TEXT }}>Une idée, un besoin pour le club ?</b><span style={{ fontSize: 12.5, color: MUT }}>Propose un sujet au conseil d'administration.</span></span>
      <span aria-hidden="true" style={{ color: MUT, fontSize: 18 }}>›</span>
    </button>
    {open && <Sheet title="Proposer un sujet au CA" onClose={() => setOpen(false)}>
      {done ? <>
        <div style={{ background: "#E7F4EA", color: "#1F5C30", borderRadius: 12, padding: "10px 12px", fontSize: 14 }}>{done}</div>
        <div style={{ display: "flex", gap: 8 }}><button className="btn btn-ghost" onClick={() => setDone("")}>Proposer un autre sujet</button><button className="btn btn-dark" onClick={() => setOpen(false)}>Fermer</button></div>
      </> : <>
        <div style={{ fontSize: 13.5, color: MUT, lineHeight: 1.5 }}>Ton sujet arrive dans la banque des sujets du CA, qui décide quand l'aborder. Les membres du CA reçoivent une notification.</div>
        <div><label className="lbl" htmlFor="ps-t">Sujet</label><input id="ps-t" className="inp" maxLength={120} placeholder="ex. Créneau supplémentaire pour les U15" value={titre} onChange={(e) => setTitre(e.target.value)} /></div>
        <div><label className="lbl" htmlFor="ps-th">Thème</label><select id="ps-th" className="sel" value={theme} onChange={(e) => setTheme(e.target.value)}>{THEMES_CA.map((x) => <option key={x}>{x}</option>)}</select></div>
        <div><label className="lbl" htmlFor="ps-d">Explications (facultatif)</label><textarea id="ps-d" className="ta" rows={4} maxLength={3000} value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Contexte, besoin, proposition…" /></div>
        <button className="btn btn-red" disabled={busy || !titre.trim()} onClick={send} style={{ alignSelf: "flex-start" }}><i className="ti ti-send" aria-hidden="true" />{busy ? "Envoi…" : "Envoyer au CA"}</button>
      </>}
    </Sheet>}
  </>;
}

// ---------------------------------------------------------------- Vue club (supervision)
function teamStats(d, t, today) {
  const ss = d.seances.filter((s) => teamOf(s) === t.id);
  const month = today.slice(0, 7);
  const late = ss.filter((s) => f(s, "Statut") !== "Pointée" && f(s, "Statut") !== "Annulée" && f(s, "Date") < today);
  let pres = 0, tot = 0;
  ss.filter((s) => f(s, "Statut") === "Pointée" && String(f(s, "Date")).startsWith(month)).forEach((s) => { tot += rosterAt(d, t.id, f(s, "Date")).length; pres += (f(s, "Pointages") || []).length; });
  const next = ss.filter((s) => f(s, "Date") >= today && f(s, "Statut") !== "Annulée" && f(s, "Statut") !== "Pointée").sort((a, b) => (String(f(a, "Date")) + (f(a, "Heure") || "")).localeCompare(String(f(b, "Date")) + (f(b, "Heure") || "")))[0];
  const last = ss.filter((s) => f(s, "Type") === "Match" && f(s, "Résultat")).sort((a, b) => String(f(b, "Date")).localeCompare(String(f(a, "Date"))))[0];
  const week = ss.filter((s) => f(s, "Date") >= today && f(s, "Date") <= addDays(today, 7) && f(s, "Statut") !== "Annulée").length;
  return { late, pres, tot, rate: tot ? Math.round(pres / tot * 100) : null, next, last, week, n: rosterAt(d, t.id, today).length };
}
function ClubView({ d, banner, onTeam, onOpen, rights, onManage, onCreated }) {
  const today = TODAY();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busyNew, setBusyNew] = useState(false);
  const canEff = has(rights, "eff");
  const createTeam = async () => {
    const n = newName.trim(); if (!n) return;
    setBusyNew(true);
    try { const j = await db({ action: "create", table: "Équipes", fields: { "Nom": n, "Saison": SAISON, "Ordre": d.teams.length + 1 } }); setNewName(""); setCreating(false); await onCreated(((j.records || [])[0] || {}).id); }
    catch (e) { alert("Erreur : " + e.message); }
    setBusyNew(false);
  };
  const [staff, setStaff] = useState({});
  useEffect(() => {
    Promise.all([db({ action: "list", table: "Staff" }), db({ action: "list", table: "Utilisateurs" })]).then(([s, u]) => {
      const users = u.records || []; const m = {};
      (s.records || []).forEach((x) => { const tid = (f(x, "Équipe") || [])[0]; const us = users.find((y) => y.id === (f(x, "Personne") || [])[0]); if (!tid || !us) return; (m[tid] = m[tid] || []).push({ nom: [f(us, "Prénom"), f(us, "Nom")].filter(Boolean).join(" "), fn: f(x, "Fonction") || "" }); });
      setStaff(m);
    }).catch(() => {});
  }, []);
  const rows = d.teams.map((t) => ({ t, s: teamStats(d, t, today) }));
  const lateN = rows.reduce((a, r) => a + r.s.late.length, 0);
  const weekN = rows.reduce((a, r) => a + r.s.week, 0);
  const P = rows.reduce((a, r) => a + r.s.pres, 0), T = rows.reduce((a, r) => a + r.s.tot, 0);
  const todays = d.seances.filter((s) => f(s, "Date") === today && d.teams.some((t) => t.id === teamOf(s))).sort((a, b) => String(f(a, "Heure")).localeCompare(String(f(b, "Heure"))));
  const matches = d.seances.filter((s) => f(s, "Type") === "Match" && f(s, "Date") >= today && f(s, "Date") <= addDays(today, 7) && f(s, "Statut") !== "Annulée" && d.teams.some((t) => t.id === teamOf(s))).length;
  const tShort = (id) => (f(d.teams.find((t) => t.id === id), "Nom") || "").split("·")[0].trim();
  const sorted = rows.slice().sort((a, b) => (b.s.late.length > 0) - (a.s.late.length > 0));
  const Kpi = ({ label, value, sub, tone, color }) => <div className="card" style={{ borderLeft: "4px solid " + tone, padding: "12px 14px", minWidth: 0 }}>
    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".06em", color: MUT }}>{label}</div>
    <div style={{ fontSize: 26, fontWeight: 800, color: color || TEXT }}>{value}</div>
    <div style={{ fontSize: 12, color: MUT }}>{sub}</div></div>;
  return (
    <div className="fade" style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 1000 }}>
      {banner}
      <div style={{ fontSize: 20, fontWeight: 800, color: TEXT, padding: "2px 4px 0" }}>Le club en un coup d'œil</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        <Kpi label="ÉQUIPES SUIVIES" value={d.teams.length} sub={rows.reduce((a, r) => a + r.s.n, 0) + " joueurs"} tone={BLACK} />
        <Kpi label="EN RETARD DE POINTAGE" value={lateN} sub={lateN ? "séance(s) à pointer" : "tout est à jour"} tone={lateN ? RED : OK} color={lateN ? "#B42318" : TEXT} />
        <Kpi label="PRÉSENCE DU MOIS" value={T ? Math.round(P / T * 100) + " %" : "—"} sub="toutes équipes" tone={RED} />
        <Kpi label="7 PROCHAINS JOURS" value={weekN} sub={"séance(s) dont " + matches + " match(s)"} tone={YELLOW} />
      </div>
      <div style={{ fontSize: 14, fontWeight: 800, color: "#3A3F47", padding: "4px 4px 0" }}>Aujourd'hui au club</div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {todays.map((s) => { const st = f(s, "Statut") || "Prévue"; return <button key={s.id} onClick={() => onOpen(s.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", border: "none", borderBottom: "1px solid #F0F1F4", background: "#fff", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
          <span style={{ fontSize: 11, fontWeight: 800, padding: "4px 8px", borderRadius: 10, background: "#F4F5F8", minWidth: 34, textAlign: "center" }}>{tShort(teamOf(s))}</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: TEXT }}>{f(s, "Heure") ? f(s, "Heure") + " · " : ""}{f(s, "Type")}{f(s, "Adversaire") ? " vs " + f(s, "Adversaire") : ""}</span>
          <span style={{ fontSize: 12, fontWeight: 800, padding: "4px 9px", borderRadius: 10, background: st === "Pointée" ? "#E7F4EA" : st === "Annulée" ? "#EEF0F3" : "#FFF6D6", color: st === "Pointée" ? "#1F5C30" : st === "Annulée" ? MUT : "#6B4A00" }}>{st === "Pointée" ? (f(s, "Pointages") || []).length + " présents" : st}</span>
        </button>; })}
        {!todays.length && <div style={{ fontSize: 13.5, color: MUT, padding: 14 }}>Pas de séance prévue aujourd'hui dans le club.</div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "4px 4px 0" }}>
        <div style={{ flex: 1, fontSize: 14, fontWeight: 800, color: "#3A3F47" }}>Les équipes <span style={{ fontWeight: 600, color: MUT }}>· touche une équipe pour le détail</span></div>
        {canEff && !creating && <button className="btn btn-red" onClick={() => setCreating(true)}><i className="ti ti-plus" aria-hidden="true" />Nouvelle équipe</button>}
      </div>
      {creating && <div className="card" style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", borderLeft: "4px solid " + RED }}>
        <div style={{ flex: "1 1 200px" }}><label className="lbl" htmlFor="cl-nt">Nom de la nouvelle équipe</label><input id="cl-nt" className="inp" autoFocus placeholder="ex. U15 F" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createTeam()} /></div>
        <button className="btn btn-red" disabled={busyNew || !newName.trim()} onClick={createTeam}>{busyNew ? "Création…" : "Créer et ajouter les entraîneurs"}</button>
        <button className="btn btn-ghost" onClick={() => { setCreating(false); setNewName(""); }}>Annuler</button>
      </div>}
      {!d.teams.length && <div className="card" style={{ color: MUT, fontSize: 13.5 }}>Aucune équipe pour l'instant.{canEff ? " Crée la première avec « Nouvelle équipe »." : ""}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
        {sorted.map(({ t, s }) => { const st = staff[t.id] || []; const coach = st.find((x) => x.fn === "Coach 1") || st.find((x) => /coach|entra[iî]neur/i.test(x.fn)) || st[0]; return (
          <button key={t.id} className="card" onClick={() => onTeam(t.id)} aria-label={"Détail de l'équipe " + f(t, "Nom")} style={{ textAlign: "left", cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", gap: 8, borderLeft: "4px solid " + (s.late.length ? RED : f(t, "Primes actives") ? YELLOW : BORDER), minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 800, color: TEXT }}>{f(t, "Nom")}</span>
              {s.late.length > 0 && <span style={{ fontSize: 11.5, fontWeight: 800, padding: "4px 9px", borderRadius: 10, background: "#FDECEC", color: "#9E1B1B", whiteSpace: "nowrap" }}>{s.late.length} à pointer</span>}
              <span aria-hidden="true" style={{ color: MUT, fontSize: 18 }}>›</span>
            </div>
            <div style={{ fontSize: 12.5, color: MUT }}>{coach ? coach.nom + (coach.fn ? " · " + coach.fn : "") : "Pas d'entraîneur rattaché"} · {s.n} joueurs</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
              <div><div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".06em", color: MUT }}>PRÉSENCE DU MOIS</div><div style={{ fontSize: 18, fontWeight: 800, color: s.rate == null ? MUT : s.rate < 60 ? "#B42318" : TEXT }}>{s.rate == null ? "—" : s.rate + " %"}</div></div>
              <div><div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".06em", color: MUT }}>DERNIER MATCH</div><div style={{ fontSize: 13.5, fontWeight: 700, color: TEXT }}>{s.last ? f(s.last, "Résultat") + " " + (f(s.last, "Score VHB") ?? "") + "-" + (f(s.last, "Score adverse") ?? "") : "—"}</div></div>
            </div>
            <div style={{ fontSize: 12.5, color: "#3A3F47", borderTop: "1px solid #F0F1F4", paddingTop: 8 }}>{s.next ? "Prochaine : " + dayLabel(f(s.next, "Date")) + (f(s.next, "Heure") ? " · " + f(s.next, "Heure") : "") + " · " + f(s.next, "Type") + (f(s.next, "Adversaire") ? " vs " + f(s.next, "Adversaire") : "") : "Aucune séance planifiée"}</div>
          </button>); })}
      </div>
      <ProposeSujet />
    </div>
  );
}

function SeanceBanner({ s, team, n, onClick }) {
  const st = f(s, "Statut");
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 14, background: BLACK, border: "none", borderRadius: 22, padding: 16, cursor: "pointer", fontFamily: "inherit", textAlign: "left", boxShadow: "0 6px 18px rgba(20,22,30,.18)" }}>
      <span style={{ width: 52, height: 52, borderRadius: 14, background: st === "Pointée" ? "#9BE1AE" : YELLOW, color: BLACK, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}><i className={"ti " + (st === "Pointée" ? "ti-check" : TYPE_ICON[f(s, "Type")] || "ti-run")} style={{ fontSize: 24 }} aria-hidden="true" /></span>
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".06em", color: YELLOW }}>{(st === "Pointée" ? "POINTÉE · " : st === "Annulée" ? "ANNULÉE · " : "") + team.toUpperCase()}</span>
        <span style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>{(f(s, "Heure") ? f(s, "Heure").replace(":", "h") + " · " : "") + f(s, "Type") + (f(s, "Adversaire") ? " vs " + f(s, "Adversaire") : "")}</span>
        <span style={{ fontSize: 13, color: "#C9CCD2" }}>{st === "Pointée" ? (f(s, "Pointages") || []).length + " présent(s) · touche pour corriger" : n + " joueurs · touche pour pointer"}</span>
      </span>
      <i className="ti ti-chevron-right" style={{ color: "#fff", fontSize: 20 }} aria-hidden="true" />
    </button>
  );
}

function SeancesList({ d, mineS, tName, filter, setFilter, onOpen, banner }) {
  const [month, setMonth] = useState(TODAY().slice(0, 7));
  const months = [...new Set(d.seances.map((s) => String(f(s, "Date")).slice(0, 7)))].sort();
  const list = mineS.filter((s) => String(f(s, "Date")).startsWith(month)).sort((a, b) => (String(f(a, "Date")) + f(a, "Heure")).localeCompare(String(f(b, "Date")) + f(b, "Heure")));
  const cnt = (t) => list.filter((s) => f(s, "Type") === t && f(s, "Statut") === "Pointée").length;
  const ST = { "Pointée": ["#E7F4EA", "#1F5C30"], "Annulée": ["#EEF0F3", MUT], "Prévue": ["#FDECEC", "#9E1B1B"] };
  const today = TODAY();
  return (
    <div className="fade" style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 820 }}>
      {banner}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <label htmlFor="sl-m" style={{ fontSize: 13, fontWeight: 700 }}>Mois</label>
        <select id="sl-m" className="sel" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: "auto" }}>{months.map((m) => <option key={m} value={m}>{MOIS[Number(m.slice(5)) - 1]} {m.slice(0, 4)}</option>)}</select>
        <label htmlFor="sl-t" style={{ fontSize: 13, fontWeight: 700 }}>Équipe</label>
        <select id="sl-t" className="sel" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: "auto" }}><option value="all">Toutes</option>{d.teams.map((t) => <option key={t.id} value={t.id}>{f(t, "Nom")}</option>)}</select>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
        <div className="card" style={{ borderLeft: "4px solid " + RED, padding: 12 }}><div style={{ fontSize: 11, fontWeight: 800, color: MUT }}>ENTRAÎNEMENTS</div><div style={{ fontSize: 24, fontWeight: 800 }}>{cnt("Entraînement") + cnt("Entraînement supplémentaire")}</div></div>
        <div className="card" style={{ borderLeft: "4px solid " + YELLOW, padding: 12 }}><div style={{ fontSize: 11, fontWeight: 800, color: MUT }}>MATCHS</div><div style={{ fontSize: 24, fontWeight: 800 }}>{cnt("Match")}</div></div>
        <div className="card" style={{ borderLeft: "4px solid #9AA0A8", padding: 12 }}><div style={{ fontSize: 11, fontWeight: 800, color: MUT }}>ANNULÉES</div><div style={{ fontSize: 24, fontWeight: 800 }}>{list.filter((s) => f(s, "Statut") === "Annulée").length}</div></div>
      </div>
      <div className="card" style={{ padding: 0 }}>
        {list.map((s) => { const st = f(s, "Statut") || "Prévue"; const late = st === "Prévue" && f(s, "Date") < today; const c = ST[st]; return (
          <button key={s.id} onClick={() => onOpen(s.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", border: "none", borderBottom: "1px solid #F0F1F4", background: "#fff", cursor: "pointer", fontFamily: "inherit", textAlign: "left", flexWrap: "wrap" }}>
            <span style={{ minWidth: 100, fontWeight: 700, fontSize: 13.5 }}>{dayLabel(f(s, "Date"))}{f(s, "Heure") ? " · " + f(s, "Heure") : ""}</span>
            <span style={{ flex: "1 1 160px", fontSize: 14 }}>{tName(teamOf(s))} · {f(s, "Type")}{f(s, "Adversaire") ? " vs " + f(s, "Adversaire") : ""}{f(s, "Résultat") ? " · " + f(s, "Résultat") + " " + (f(s, "Score VHB") ?? "") + "-" + (f(s, "Score adverse") ?? "") : ""}</span>
            <span style={{ fontSize: 12, fontWeight: 800, padding: "4px 9px", borderRadius: 10, background: late ? "#FDECEC" : c[0], color: late ? "#9E1B1B" : c[1] }}>{late ? "À pointer" : st === "Pointée" ? (f(s, "Pointages") || []).length + " présents" : st === "Annulée" ? "Annulée" + (f(s, "Motif annulation") ? " · " + f(s, "Motif annulation") : "") : "Prévue"}</span>
          </button>); })}
        {!list.length && <div style={{ padding: 14, fontSize: 13.5, color: MUT }}>Aucune séance ce mois-ci.</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Pointage
function PointageView({ s, d, me, rights, onBack, onDone }) {
  const isMatch = f(s, "Type") === "Match";
  const date = f(s, "Date");
  const roster = rosterAt(d, teamOf(s), date);
  const teamName = f(d.teams.find((t) => t.id === teamOf(s)), "Nom") || "";
  const pointed = f(s, "Statut") === "Pointée";
  const cancelled = f(s, "Statut") === "Annulée";
  const [loading, setLoading] = useState(pointed);
  const [sel, setSel] = useState(() => new Set(isMatch ? [] : roster.map((r) => r.p.id)));
  const [score, setScore] = useState({ vhb: f(s, "Score VHB") ?? 0, adv: f(s, "Score adverse") ?? 0 });
  const [busy, setBusy] = useState(false);
  const [cancelMode, setCancelMode] = useState(false);
  const [motif, setMotif] = useState("Gymnase indisponible");
  // Qui a pointé, et quand (« déjà pointée par Karim le 8 nov. à 19h45 »).
  const [byName, setByName] = useState("");
  const byId = (f(s, "Pointée par") || [])[0];
  useEffect(() => {
    if (!pointed || !byId) return;
    if (byId === (me && me.id)) { setByName("toi"); return; }
    db({ action: "list", table: "Utilisateurs" }).then((j) => { const u = (j.records || []).find((x) => x.id === byId); if (u) setByName([f(u, "Prénom"), f(u, "Nom")].filter(Boolean).join(" ")); }).catch(() => {});
  }, [s.id]);
  const when = f(s, "Pointée le") ? new Date(f(s, "Pointée le")) : null;
  const pointedTxt = pointed ? " · déjà pointée" + (byName ? " par " + byName : "") + (when ? " le " + when.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) + " à " + when.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }).replace(":", "h") : "") + ", tu peux corriger" : "";
  // Séance déjà pointée : on recharge qui était présent.
  useEffect(() => {
    if (!pointed) return;
    const ids = f(s, "Pointages") || [];
    if (!ids.length) { setSel(new Set()); setLoading(false); return; }
    db({ action: "list", table: "Pointages", filterByFormula: "OR(" + ids.slice(0, 80).map((id) => "RECORD_ID()='" + id + "'").join(",") + ")" })
      .then((j) => { setSel(new Set((j.records || []).flatMap((r) => f(r, "Joueur") || []))); setLoading(false); }, () => setLoading(false));
  }, [s.id]);
  const toggle = (id) => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n); };
  const nPres = roster.filter((r) => sel.has(r.p.id)).length;
  const save = async () => {
    const payload = { action: "save", seanceId: s.id, presents: roster.filter((r) => sel.has(r.p.id)).map((r) => r.p.id), capturedAt: new Date().toISOString() };
    if (isMatch) payload.score = score;
    setBusy(true);
    try {
      const j = await callPointage(payload);
      onDone(j.skipped ? j.reason : null);
    } catch (e) {
      if (!e.status) { writeQueue(readQueue().filter((q) => q.seanceId !== s.id).concat(payload)); onDone("Pas de réseau : le pointage est gardé sur le téléphone et partira tout seul dès le retour de la connexion."); }
      else { alert("Pointage refusé : " + e.message); setBusy(false); }
    }
  };
  const doCancel = async () => {
    setBusy(true);
    try { await callPointage({ action: "cancel", seanceId: s.id, motif }); onDone(); } catch (e) { alert("Impossible : " + e.message); setBusy(false); }
  };
  const reopen = async () => {
    setBusy(true);
    try { await callPointage({ action: "reopen", seanceId: s.id }); onDone(); } catch (e) { alert("Impossible : " + e.message); setBusy(false); }
  };
  const result = isMatch ? (score.vhb > score.adv ? "Victoire" : score.vhb === score.adv ? "Match nul" : "Défaite") : null;
  const stepper = (k, label) => <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
    <div style={{ fontSize: 12, fontWeight: 800, color: MUT }}>{label}</div>
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <button type="button" className="btn btn-ghost" style={{ width: 44, height: 44, justifyContent: "center", padding: 0, fontSize: 22 }} aria-label={"Retirer un but " + label} onClick={() => setScore({ ...score, [k]: Math.max(0, Number(score[k]) - 1) })}>−</button>
      <input aria-label={"Score " + label} inputMode="numeric" value={score[k]} onChange={(e) => setScore({ ...score, [k]: Number(e.target.value.replace(/\D/g, "") || 0) })} style={{ width: 60, textAlign: "center", fontSize: 30, fontWeight: 800, border: "none", fontFamily: "inherit", background: "transparent" }} />
      <button type="button" className="btn btn-ghost" style={{ width: 44, height: 44, justifyContent: "center", padding: 0, fontSize: 22 }} aria-label={"Ajouter un but " + label} onClick={() => setScore({ ...score, [k]: Number(score[k]) + 1 })}>+</button>
    </div>
  </div>;
  return (
    <div className="fade" style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 640, paddingBottom: 90 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button className="btn btn-ghost" onClick={onBack} aria-label="Retour" style={{ padding: "8px 10px" }}><i className="ti ti-chevron-left" aria-hidden="true" /></button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{f(s, "Type")}{f(s, "Heure") ? " · " + f(s, "Heure").replace(":", "h") : ""}{f(s, "Adversaire") ? " vs " + f(s, "Adversaire") : ""}</div>
          <div style={{ fontSize: 13, color: MUT }}>{dayLabel(date)} · {teamName}{pointedTxt}</div>
        </div>
      </div>
      {cancelled ? <div className="card" style={{ borderLeft: "4px solid #9AA0A8" }}>
        <div style={{ fontWeight: 800, marginBottom: 4 }}>Séance annulée{f(s, "Motif annulation") ? " · " + f(s, "Motif annulation") : ""}</div>
        <div style={{ fontSize: 13, color: MUT, marginBottom: 10 }}>Elle ne compte pas dans le calcul des primes.</div>
        <button className="btn btn-ghost" disabled={busy} onClick={reopen}>Finalement, la séance a eu lieu</button>
      </div> : <>
        {isMatch && <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>{stepper("vhb", "VHB")}{stepper("adv", f(s, "Adversaire") ? String(f(s, "Adversaire")).toUpperCase().slice(0, 14) : "ADVERSAIRE")}</div>
          <div style={{ borderRadius: 14, padding: "12px 14px", fontSize: 14, fontWeight: 800, textAlign: "center", background: result === "Victoire" ? "#E7F4EA" : "#EEF0F3", color: result === "Victoire" ? "#1F5C30" : "#3A3F47" }}>{result}{result === "Victoire" && nPres ? " · prime de victoire pour les " + nPres + " joueurs cochés" : ""}</div>
        </div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
          <div style={{ background: "#E7F4EA", borderRadius: 14, padding: "10px 14px" }}><span style={{ fontSize: 24, fontWeight: 800, color: "#1F5C30" }}>{nPres}</span> <span style={{ fontSize: 13, fontWeight: 700, color: "#1F5C30" }}>{isMatch ? "sur la feuille" : "présents"}</span></div>
          <div style={{ background: "#EEF0F3", borderRadius: 14, padding: "10px 14px" }}><span style={{ fontSize: 24, fontWeight: 800, color: "#3A3F47" }}>{roster.length - nPres}</span> <span style={{ fontSize: 13, fontWeight: 700, color: "#3A3F47" }}>{isMatch ? "non retenus" : "absents"}</span></div>
        </div>
        <div style={{ fontSize: 13, color: MUT }}>{isMatch ? "Coche les joueurs de la feuille de match, sans limite de nombre. Cocher vaut présence." : "Tout le monde est présent par défaut. Touche un joueur pour le marquer absent."}</div>
        {loading ? <div className="card" style={{ color: MUT }}>Chargement du pointage…</div> : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {roster.map(({ e, p }) => { const on = sel.has(p.id); return (
            <button key={p.id} onClick={() => toggle(p.id)} aria-pressed={on} style={{ width: "100%", minHeight: 58, border: "1px solid " + (on ? "#fff" : "#D9DCE1"), background: on ? "#fff" : "#F4F5F8", borderRadius: 14, padding: "8px 12px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", fontFamily: "inherit", textAlign: "left", boxShadow: on ? "0 1px 3px rgba(20,22,30,.08)" : "none" }}>
              <span style={{ width: 38, height: 38, borderRadius: 19, flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, background: on ? "#FCE9DE" : "#E2E5E9", color: on ? "#8A2807" : MUT }}>{initials(p)}</span>
              <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 15, fontWeight: 700, color: TEXT }}>{pName(p)}</span>{f(e, "Statut") === "Renfort" && <span style={{ fontSize: 11.5, fontWeight: 700, color: "#6B4A00" }}>Renfort</span>}</span>
              {isMatch ? <span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: on ? RED : "#fff", border: "2px solid " + (on ? RED : "#B8BDC4") }}>{on && <i className="ti ti-check" style={{ color: "#fff" }} />}</span>
                : <span style={{ fontSize: 13, fontWeight: 800, padding: "7px 12px", borderRadius: 20, background: on ? "#E7F4EA" : "#fff", color: on ? "#1F5C30" : MUT, border: "1px solid " + (on ? "#E7F4EA" : "#D9DCE1") }}>{on ? "Présent" : "Absent"}</span>}
            </button>); })}
          {!roster.length && <div className="card" style={{ color: MUT, fontSize: 13.5 }}>Aucun joueur dans l'effectif de l'équipe à cette date. L'effectif se gère dans Admin › Équipes.</div>}
        </div>}
        {!cancelMode ? <button className="btn btn-ghost" style={{ alignSelf: "flex-start" }} onClick={() => setCancelMode(true)}>Séance annulée ?</button>
          : <div className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 200px" }}><label className="lbl" htmlFor="cx-m">Motif</label>
              <select id="cx-m" className="sel" value={motif} onChange={(e) => setMotif(e.target.value)}>{["Gymnase indisponible", "Vacances", "Mise au repos", "Intempéries", "Match reporté", "Autre"].map((m) => <option key={m}>{m}</option>)}</select></div>
            <button className="btn btn-dark" disabled={busy} onClick={doCancel}>Confirmer l'annulation</button>
            <button className="btn btn-ghost" onClick={() => setCancelMode(false)}>Non</button>
          </div>}
        <div style={{ position: "sticky", bottom: "calc(74px + env(safe-area-inset-bottom))", zIndex: 5 }}>
          <button className="btn btn-red" disabled={busy || loading} onClick={save} style={{ width: "100%", justifyContent: "center", minHeight: 56, fontSize: 16, fontWeight: 800 }}>
            <i className="ti ti-check" aria-hidden="true" />{busy ? "Enregistrement…" : (isMatch ? "Valider le match · " + nPres + " joueurs" : "Valider · " + nPres + " présents")}
          </button>
        </div>
      </>}
    </div>
  );
}

// ---------------------------------------------------------------- Création match / séance supplémentaire
function CreateSeance({ kind, d, me, onCancel, onCreated }) {
  const isMatch = kind === "Match";
  const [team, setTeam] = useState((d.teams[0] || {}).id || "");
  const [date, setDate] = useState(TODAY());
  const [heure, setHeure] = useState(isMatch ? "20:30" : "19:30");
  const [adv, setAdv] = useState("");
  const [dom, setDom] = useState(true);
  const [type, setType] = useState("Entraînement supplémentaire");
  const [compte, setCompte] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!isMatch) setCompte(type !== "Stage"); }, [type]);
  const tName = f(d.teams.find((t) => t.id === team), "Nom") || "";
  const create = async () => {
    if (!team || !date) return;
    if (isMatch && !adv.trim()) { alert("Indique l'adversaire."); return; }
    setBusy(true);
    const t = isMatch ? "Match" : type;
    const fields = { "Libellé": tName + " · " + t + " · " + date, "Équipe": [team], "Date": date, "Heure": heure, "Type": t, "Statut": "Prévue", "Compte primes": isMatch ? true : compte };
    if (isMatch) Object.assign(fields, { "Adversaire": adv.trim(), "Domicile": dom });
    try { const j = await db({ action: "create", table: "Séances", fields }); onCreated(((j.records || [])[0] || {}).id); }
    catch (e) { alert("Création impossible : " + e.message); setBusy(false); }
  };
  return (
    <div className="card fade" style={{ maxWidth: 560, display: "flex", flexDirection: "column", gap: 12, borderLeft: "4px solid " + RED }}>
      <div style={{ fontSize: 18, fontWeight: 800 }}>{isMatch ? "Nouveau match" : "Séance supplémentaire"}</div>
      {d.teams.length > 1 && <div><label className="lbl" htmlFor="cs-t">Équipe</label><select id="cs-t" className="sel" value={team} onChange={(e) => setTeam(e.target.value)}>{d.teams.map((t) => <option key={t.id} value={t.id}>{f(t, "Nom")}</option>)}</select></div>}
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><label className="lbl" htmlFor="cs-d">Date</label><input id="cs-d" className="inp" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div style={{ flex: 1 }}><label className="lbl" htmlFor="cs-h">Heure</label><input id="cs-h" className="inp" type="time" value={heure} onChange={(e) => setHeure(e.target.value)} /></div>
      </div>
      {isMatch ? <>
        <div><label className="lbl" htmlFor="cs-a">Adversaire</label><input id="cs-a" className="inp" value={adv} onChange={(e) => setAdv(e.target.value)} placeholder="ex. Istres" /></div>
        <div role="group" aria-label="Lieu" style={{ display: "flex", gap: 6 }}>{[[true, "À domicile"], [false, "À l'extérieur"]].map(([v, l]) => <button key={l} type="button" aria-pressed={dom === v} onClick={() => setDom(v)} style={{ minHeight: 40, padding: "0 14px", borderRadius: 20, cursor: "pointer", fontFamily: "inherit", fontWeight: 800, fontSize: 13, border: "1px solid " + (dom === v ? BLACK : "#D9DCE1"), background: dom === v ? BLACK : "#fff", color: dom === v ? "#fff" : "#3A3F47" }}>{l}</button>)}</div>
      </> : <>
        <div><label className="lbl" htmlFor="cs-ty">Type</label><select id="cs-ty" className="sel" value={type} onChange={(e) => setType(e.target.value)}><option>Entraînement supplémentaire</option><option>Stage</option></select></div>
        <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, minHeight: 40, cursor: "pointer" }}><input type="checkbox" checked={compte} onChange={(e) => setCompte(e.target.checked)} style={{ width: 20, height: 20, accentColor: RED }} />Compte dans le calcul des primes</label>
      </>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-red" disabled={busy} onClick={create}>{busy ? "Création…" : "Créer et pointer"}</button>
        <button className="btn btn-ghost" onClick={onCancel}>Annuler</button>
      </div>
    </div>
  );
}
