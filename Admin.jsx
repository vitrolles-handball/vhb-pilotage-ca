// ===========================================================================
// CONSOLE ADMINISTRATION — VHB Team
//  • Utilisateurs : rôles, droits ajoutés, équipes (Staff), activation, invitation
//  • Rôles : créer / modifier des rôles (modèles de droits), portée
//  • Équipes : équipes de la saison, staff, effectifs, ajout et import de joueurs
//  • Journal : qui a fait quoi
// Les droits sont vérifiés côté serveur (api/db.js) ; l'interface masque seulement
// ce que la personne ne peut pas faire.
// ===========================================================================
import { PaymentsPanel } from "./Primes.jsx";
import { PlayerCard } from "./Fiche.jsx";
import { SupportPanel } from "./Comms.jsx";
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { db, f, authApi, fullName, Avatar, RED, YELLOW, BLACK, TEXT, MUT, BORDER, OK, VACANCES_DEFAUT } from "./App.jsx";

export const RIGHT_GROUPS = [
  ["Pilotage du CA", [["ca", "Voir et utiliser le Pilotage du CA"]]],
  ["Sportif", [["point", "Pointer les séances"], ["eff", "Gérer les équipes et les effectifs"], ["plan", "Modifier le planning des séances"]]],
  ["Primes", [["param", "Paramétrer les barèmes"], ["corr", "Corriger les primes"], ["valid", "Valider un mois"], ["compta", "Comptabilité · paiements"]]],
  ["Messagerie", [["msg", "Envoyer des annonces"], ["msgall", "Écrire à tout le club"]]],
  ["Administration", [["users", "Gérer les utilisateurs"], ["roles", "Gérer les rôles"], ["support", "Traiter le support"], ["journal", "Consulter le journal"]]],
];
const RIGHT_LABEL = Object.fromEntries(RIGHT_GROUPS.flatMap(([, l]) => l));
export const has = (rights, r) => (rights || []).includes("*") || (rights || []).includes(r);
export const ADMIN_RIGHTS = ["users", "roles", "eff", "journal", "param", "plan", "compta", "support"];
export const hasAdminAccess = (rights) => ADMIN_RIGHTS.some((r) => has(rights, r));
export function adminTabsFor(rights) {
  const t = [];
  if (has(rights, "users")) t.push(["users", "Utilisateurs"]);
  if (has(rights, "roles") || has(rights, "users")) t.push(["roles", "Rôles"]);
  if (has(rights, "eff") || has(rights, "param") || has(rights, "plan")) t.push(["equipes", "Équipes"]);
  if (has(rights, "compta")) t.push(["paiements", "Paiements"]);
  if (has(rights, "support")) t.push(["support", "Support"]);
  if (has(rights, "journal")) t.push(["journal", "Journal"]);
  return t;
}
const COLORS = ["#16171B", "#D62828", "#E8590C", "#8A6A00", "#2F7A43", "#1B5E9B", "#7A3FB0", "#5E646D"];
const FONCTIONS = ["Coach 1", "Coach 2", "Dirigeant", "Autre"];
const SAISON = (() => { const d = new Date(); const y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; return y + "-" + (y + 1); })();
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const frDate = (s) => { if (!s) return "—"; const d = String(s).slice(0, 10).split("-"); return d.length === 3 ? d[2] + "/" + d[1] + "/" + d[0] : s; };
const today = () => new Date().toISOString().slice(0, 10);

function chipStyle(on, color) {
  return { minHeight: 36, padding: "0 13px", borderRadius: 20, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700, border: "1px solid " + (on ? (color || BLACK) : "#D9DCE1"), background: on ? (color || BLACK) : "#fff", color: on ? "#fff" : "#3A3F47", display: "inline-flex", alignItems: "center", gap: 6 };
}
function Box({ on, inherited, disabled }) {
  const bg = on ? (inherited ? "#8A8F98" : RED) : "#fff";
  return <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: 7, flex: "0 0 auto", display: "inline-flex", alignItems: "center", justifyContent: "center", background: bg, border: "2px solid " + (on ? bg : "#B8BDC4"), opacity: disabled ? 0.55 : 1 }}>{on && <i className="ti ti-check" style={{ color: "#fff", fontSize: 14 }} />}</span>;
}
const Section = ({ title, children, right }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".06em", color: MUT, flex: 1 }}>{title}</div>{right}</div>
    {children}
  </div>
);
const Empty = ({ children }) => <div style={{ fontSize: 13.5, color: MUT, padding: "18px 4px", textAlign: "center" }}>{children}</div>;

// ---------------------------------------------------------------- Données
function useAdminData(rights) {
  const [d, setD] = useState({ users: [], roles: [], teams: [], staff: [], players: [], efx: [], rythmes: [], loaded: false, error: "" });
  const load = useCallback(async () => {
    try {
      const canPlayers = ["eff", "point", "corr", "valid", "compta"].some((r) => has(rights, r));
      const [u, r, t, s, p, e, ry] = await Promise.all([
        db({ action: "list", table: "Utilisateurs" }),
        db({ action: "list", table: "Rôles" }),
        db({ action: "list", table: "Équipes" }),
        db({ action: "list", table: "Staff" }),
        canPlayers ? db({ action: "list", table: "Joueurs" }) : Promise.resolve({ records: [] }),
        canPlayers ? db({ action: "list", table: "Effectifs" }) : Promise.resolve({ records: [] }),
        db({ action: "list", table: "Rythmes" }),
      ]);
      setD({ users: u.records || [], roles: (r.records || []).sort((a, b) => (f(a, "Ordre") || 99) - (f(b, "Ordre") || 99)), teams: (t.records || []).sort((a, b) => (f(a, "Ordre") || 99) - (f(b, "Ordre") || 99) || String(f(a, "Nom")).localeCompare(String(f(b, "Nom")))), staff: s.records || [], players: p.records || [], efx: e.records || [], rythmes: ry.records || [], loaded: true, error: "" });
    } catch (e) { setD((x) => ({ ...x, loaded: true, error: e.message })); }
  }, [rights]);
  useEffect(() => { load(); }, [load]);
  return [d, load];
}
function effectiveRights(u, roles) {
  const ids = f(u, "Rôles") || [];
  const rs = roles.filter((r) => ids.includes(r.id));
  if (f(u, "Rôle") === "Admin" || rs.some((r) => f(r, "Verrouillé"))) return { all: true, inherited: new Set(), extra: new Set(f(u, "Droits ajoutés") || []), scope: "all" };
  const inherited = new Set(rs.flatMap((r) => f(r, "Droits") || []));
  return { all: false, inherited, extra: new Set(f(u, "Droits ajoutés") || []), scope: rs.some((r) => f(r, "Portée") === "Toutes") ? "all" : "mine" };
}
const isLocked = (r) => !!f(r, "Verrouillé");

// ---------------------------------------------------------------- Espace
export default function AdminSpace({ me, rights, view, setView, onSelfChanged, supportFocus }) {
  const [d, reload] = useAdminData(rights);
  const tabs = adminTabsFor(rights);
  const cur = tabs.some(([k]) => k === view) ? view : (tabs[0] || [])[0];
  if (!tabs.length) return <div className="card"><Empty>Tu n'as accès à aucune rubrique d'administration.</Empty></div>;
  return (
    <div className="fade" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".06em", color: MUT, flex: 1 }}>ADMINISTRATION · {(tabs.find(([k]) => k === cur) || [, ""])[1].toUpperCase()}</div>
        <button onClick={reload} className="btn btn-ghost" title="Recharger les données"><i className="ti ti-refresh" aria-hidden="true" />Actualiser</button>
      </div>
      {d.error && <div className="card" style={{ color: RED, fontSize: 13.5 }}>Impossible de charger : {d.error}</div>}
      {!d.loaded ? <div className="card"><Empty>Chargement…</Empty></div> : <>
        {cur === "users" && <UsersPanel d={d} me={me} rights={rights} reload={reload} onSelfChanged={onSelfChanged} />}
        {cur === "roles" && <RolesPanel d={d} rights={rights} reload={reload} />}
        {cur === "equipes" && <TeamsPanel d={d} rights={rights} reload={reload} />}
        {cur === "paiements" && <PaymentsPanel rights={rights} />}
        {cur === "support" && <SupportPanel focusId={supportFocus} />}
        {cur === "journal" && <JournalPanel d={d} />}
      </>}
    </div>
  );
}

// ---------------------------------------------------------------- Utilisateurs
function UsersPanel({ d, me, rights, reload, onSelfChanged }) {
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);
  const [creating, setCreating] = useState(false);
  const teamName = (id) => f(d.teams.find((t) => t.id === id), "Nom") || "?";
  const staffOf = (uid) => d.staff.filter((s) => (f(s, "Personne") || []).includes(uid));
  const rows = useMemo(() => d.users.map((u) => {
    const er = effectiveRights(u, d.roles);
    const hasR = (r) => er.all || er.inherited.has(r) || er.extra.has(r);
    return { u, er, hasR, staff: staffOf(u.id), roles: d.roles.filter((r) => (f(u, "Rôles") || []).includes(r.id)) };
  }), [d]);
  const FILTERS = [["all", "Tous"], ["ca", "CA"], ["staff", "Staff sportif"], ["compta", "Comptabilité"], ["admin", "Admins"], ["off", "Inactifs"]];
  const visible = rows.filter((r) => {
    const active = f(r.u, "Actif") !== false;
    if (filter === "off") { if (active) return false; } else if (filter !== "all" && !active) return false;
    if (filter === "ca" && !r.hasR("ca")) return false;
    if (filter === "staff" && !(r.staff.length || r.hasR("point"))) return false;
    if (filter === "compta" && !r.hasR("compta")) return false;
    if (filter === "admin" && !r.er.all) return false;
    if (q && !norm(fullName(r.u) + " " + f(r.u, "Email")).includes(norm(q))) return false;
    return true;
  }).sort((a, b) => fullName(a.u).localeCompare(fullName(b.u)));
  const selRow = rows.find((r) => r.u.id === sel) || null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
      <div style={{ flex: "999 1 520px", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: TEXT, flex: 1 }}>Utilisateurs <span style={{ fontSize: 14, color: MUT, fontWeight: 700 }}>· {visible.length}</span></div>
          <button className="btn btn-red" onClick={() => { setCreating(true); setSel(null); }}><i className="ti ti-user-plus" aria-hidden="true" />Inviter une personne</button>
        </div>
        <div className="card" style={{ padding: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label htmlFor="adm-q" style={{ position: "absolute", left: -9999 }}>Rechercher</label>
          <input id="adm-q" className="inp" type="search" placeholder="Rechercher un nom, un e-mail…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: "1 1 220px", width: "auto" }} />
          <div role="group" aria-label="Filtrer" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {FILTERS.map(([k, l]) => <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)} style={chipStyle(filter === k)}>{l}</button>)}
          </div>
        </div>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {!visible.length && <Empty>Personne ne correspond à ces critères.</Empty>}
          {visible.map((r) => (
            <button key={r.u.id} onClick={() => { setSel(r.u.id); setCreating(false); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", border: "none", borderBottom: "1px solid #F0F1F4", background: sel === r.u.id ? "#FDF3EE" : "#fff", cursor: "pointer", fontFamily: "inherit", textAlign: "left", flexWrap: "wrap" }}>
              <Avatar u={r.u} size={36} />
              <span style={{ display: "flex", flexDirection: "column", minWidth: 160, flex: "1 1 160px" }}>
                <span style={{ fontWeight: 800, fontSize: 14, color: TEXT }}>{fullName(r.u)}</span>
                <span style={{ fontSize: 12.5, color: MUT }}>{f(r.u, "Email")}</span>
              </span>
              <span style={{ display: "flex", flexWrap: "wrap", gap: 5, flex: "2 1 180px" }}>
                {r.roles.map((ro) => <span key={ro.id} style={{ fontSize: 11.5, fontWeight: 800, borderRadius: 9, padding: "4px 8px", background: "#F4F5F8", color: "#3A3F47", display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 4, background: f(ro, "Couleur") || MUT }} />{f(ro, "Nom")}</span>)}
                {!r.roles.length && <span style={{ fontSize: 12, color: MUT }}>{f(r.u, "Rôle") === "Admin" ? "Admin (ancien rôle)" : "Sans rôle"}</span>}
              </span>
              <span style={{ fontSize: 12.5, color: MUT, minWidth: 80 }}>{r.er.scope === "all" ? "Toutes les équipes" : (r.staff.map((s) => teamName((f(s, "Équipe") || [])[0])).join(", ") || "—")}</span>
              <span style={{ fontSize: 12, fontWeight: 800, padding: "4px 9px", borderRadius: 10, background: f(r.u, "Actif") !== false ? "#E7F4EA" : "#EEF0F3", color: f(r.u, "Actif") !== false ? "#1F5C30" : MUT }}>{f(r.u, "Actif") !== false ? (f(r.u, "Profil complété") ? "Actif" : "Invité") : "Inactif"}</span>
            </button>
          ))}
        </div>
      </div>
      <div style={{ flex: "1 1 360px", minWidth: 0 }}>
        {creating && <NewUser d={d} rights={rights} reload={reload} onDone={(id) => { setCreating(false); setSel(id); }} onCancel={() => setCreating(false)} />}
        {!creating && selRow && <UserEditor key={selRow.u.id} row={selRow} d={d} me={me} rights={rights} reload={reload} onSelfChanged={onSelfChanged} />}
        {!creating && !selRow && <div className="card" style={{ borderLeft: "4px solid " + YELLOW }}><div style={{ fontSize: 13.5, color: MUT, lineHeight: 1.55 }}>Choisis une personne dans la liste pour modifier ses rôles, ses droits et ses équipes, ou invite quelqu'un de nouveau.</div></div>}
      </div>
    </div>
  );
}

function RolesPicker({ d, value, onChange, rights, selfAdminLock }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {d.roles.map((r) => {
        const on = value.includes(r.id);
        const blocked = isLocked(r) && (!has(rights, "*") || (selfAdminLock && on));
        return <button key={r.id} type="button" aria-pressed={on} disabled={blocked} title={blocked ? (selfAdminLock ? "Tu ne peux pas te retirer ton propre rôle d'administrateur" : "Seul un administrateur peut attribuer ce rôle") : ""}
          onClick={() => onChange(on ? value.filter((x) => x !== r.id) : value.concat(r.id))}
          style={{ ...chipStyle(on, f(r, "Couleur")), opacity: blocked ? 0.5 : 1, cursor: blocked ? "not-allowed" : "pointer" }}>
          {isLocked(r) && <i className="ti ti-lock" aria-hidden="true" />}{f(r, "Nom")}</button>;
      })}
    </div>
  );
}

function UserEditor({ row, d, me, rights, reload, onSelfChanged }) {
  const u = row.u;
  const isSelf = u.id === me.id;
  const [roles, setRoles] = useState(f(u, "Rôles") || []);
  const [extra, setExtra] = useState(f(u, "Droits ajoutés") || []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [addTeam, setAddTeam] = useState("");
  const [addFn, setAddFn] = useState("Coach 1");
  const draft = { fields: { ...u.fields, "Rôles": roles, "Droits ajoutés": extra } };
  const er = effectiveRights(draft, d.roles);
  const targetIsAdmin = row.er.all;
  const canEdit = has(rights, "users") && (!targetIsAdmin || has(rights, "*")) && !(isSelf && !has(rights, "*"));
  const dirty = JSON.stringify([...roles].sort()) !== JSON.stringify([...(f(u, "Rôles") || [])].sort()) || JSON.stringify([...extra].sort()) !== JSON.stringify([...(f(u, "Droits ajoutés") || [])].sort());
  const lockedIds = d.roles.filter(isLocked).map((r) => r.id);
  const save = async () => {
    setBusy(true); setMsg("");
    try {
      const fields = { "Rôles": roles, "Droits ajoutés": extra };
      // L'ancien champ « Rôle » suit le nouveau système, pour les écrans qui s'en servent encore.
      fields["Rôle"] = roles.some((id) => lockedIds.includes(id)) ? "Admin" : "Équipier";
      if (!has(rights, "*")) delete fields["Rôle"];
      await db({ action: "update", table: "Utilisateurs", recordId: u.id, fields });
      await reload(); setMsg("Enregistré. Les nouveaux droits s'appliquent dans les 5 minutes.");
      if (isSelf && onSelfChanged) onSelfChanged();
    } catch (e) { setMsg("Erreur : " + e.message); }
    setBusy(false);
  };
  const toggleActif = async () => {
    const actif = f(u, "Actif") !== false;
    if (actif && !confirm("Désactiver " + fullName(u) + " ? Son accès sera coupé sur tous ses appareils dans les 5 minutes.")) return;
    setBusy(true);
    try { await db({ action: "update", table: "Utilisateurs", recordId: u.id, fields: { "Actif": !actif } }); await reload(); } catch (e) { alert("Erreur : " + e.message); }
    setBusy(false);
  };
  const invite = async () => {
    setBusy(true);
    try { await authApi("invite", { userId: u.id }); setMsg("Invitation envoyée à " + f(u, "Email") + " (lien valable 7 jours)."); } catch (e) { setMsg("Envoi impossible : " + e.message); }
    setBusy(false);
  };
  const addStaff = async () => {
    if (!addTeam) return;
    setBusy(true);
    try { await db({ action: "create", table: "Staff", fields: { "Libellé": fullName(u) + " — " + (f(d.teams.find((t) => t.id === addTeam), "Nom") || ""), "Personne": [u.id], "Équipe": [addTeam], "Fonction": addFn } }); setAddTeam(""); await reload(); } catch (e) { alert("Erreur : " + e.message); }
    setBusy(false);
  };
  const delStaff = async (s) => {
    setBusy(true);
    try { await db({ action: "delete", table: "Staff", recordId: s.id }); await reload(); } catch (e) { alert("Erreur : " + e.message); }
    setBusy(false);
  };
  const staffTeams = row.staff.map((s) => (f(s, "Équipe") || [])[0]);
  return (
    <div className="card" style={{ borderLeft: "4px solid " + RED, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Avatar u={u} size={46} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: TEXT }}>{fullName(u)}{isSelf && <span style={{ fontSize: 12, color: MUT, fontWeight: 600 }}> · toi</span>}</div>
          <div style={{ fontSize: 13, color: MUT, overflow: "hidden", textOverflow: "ellipsis" }}>{f(u, "Email")}</div>
        </div>
      </div>
      {!canEdit && <div style={{ fontSize: 13, color: MUT, background: "#F4F5F8", borderRadius: 12, padding: "10px 12px" }}>{isSelf ? "Tu ne peux pas modifier tes propres droits : demande à un administrateur." : "Seul un administrateur peut modifier un autre administrateur."}</div>}
      <Section title="RÔLES · cocher un rôle pré-remplit les droits">
        {canEdit ? <RolesPicker d={d} value={roles} onChange={setRoles} rights={rights} selfAdminLock={isSelf} /> : <div style={{ fontSize: 13.5 }}>{row.roles.map((r) => f(r, "Nom")).join(", ") || "Aucun"}</div>}
      </Section>
      <Section title={"ÉQUIPES · " + (er.scope === "all" ? "ses rôles donnent accès à toutes les équipes" : "équipes où la personne intervient")}>
        {row.staff.map((s) => <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#F4F5F8", borderRadius: 12, padding: "8px 10px" }}>
          <span style={{ fontWeight: 800, fontSize: 13.5, flex: 1 }}>{f(d.teams.find((t) => t.id === (f(s, "Équipe") || [])[0]), "Nom") || "?"}</span>
          <span style={{ fontSize: 12.5, color: MUT }}>{f(s, "Fonction") || ""}</span>
          {(has(rights, "users") || has(rights, "eff")) && <button className="btn btn-ghost" style={{ padding: "6px 10px" }} disabled={busy} onClick={() => delStaff(s)} aria-label="Retirer de cette équipe"><i className="ti ti-x" aria-hidden="true" /></button>}
        </div>)}
        {!row.staff.length && <div style={{ fontSize: 13, color: MUT }}>Rattachée à aucune équipe.</div>}
        {(has(rights, "users") || has(rights, "eff")) && d.teams.length > 0 && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <label htmlFor="st-team" style={{ position: "absolute", left: -9999 }}>Équipe</label>
          <select id="st-team" className="sel" value={addTeam} onChange={(e) => setAddTeam(e.target.value)} style={{ flex: "2 1 150px", width: "auto" }}>
            <option value="">+ Rattacher à une équipe…</option>
            {d.teams.filter((t) => !f(t, "Archivée") && !staffTeams.includes(t.id)).map((t) => <option key={t.id} value={t.id}>{f(t, "Nom")}</option>)}
          </select>
          <label htmlFor="st-fn" style={{ position: "absolute", left: -9999 }}>Fonction</label>
          <select id="st-fn" className="sel" value={addFn} onChange={(e) => setAddFn(e.target.value)} style={{ flex: "1 1 110px", width: "auto" }}>{FONCTIONS.map((x) => <option key={x}>{x}</option>)}</select>
          <button className="btn btn-dark" disabled={!addTeam || busy} onClick={addStaff}>Ajouter</button>
        </div>}
      </Section>
      <Section title="DROITS">
        {er.all && <div style={{ fontSize: 13, color: TEXT, background: "#FFF6D6", borderRadius: 12, padding: "10px 12px" }}>Administrateur : tous les droits, sur toutes les équipes.</div>}
        {!er.all && RIGHT_GROUPS.map(([g, items]) => <div key={g}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#8A8F98", margin: "6px 0 2px" }}>{g.toUpperCase()}</div>
          {items.map(([k, l]) => {
            const inh = er.inherited.has(k), ex = extra.includes(k), on = inh || ex;
            return <button key={k} type="button" disabled={!canEdit || inh} aria-pressed={on} onClick={() => setExtra(ex ? extra.filter((x) => x !== k) : extra.concat(k))}
              style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 38, width: "100%", border: "none", background: "transparent", padding: 0, cursor: !canEdit || inh ? "default" : "pointer", fontFamily: "inherit", textAlign: "left" }}>
              <Box on={on} inherited={inh} disabled={!canEdit} />
              <span style={{ flex: 1, fontSize: 13.5, color: TEXT }}>{l}</span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: MUT }}>{inh ? "via le rôle" : ex ? "ajouté à la main" : ""}</span>
            </button>;
          })}
        </div>)}
      </Section>
      {msg && <div role="status" style={{ fontSize: 13, color: msg.startsWith("Erreur") || msg.startsWith("Envoi") ? RED : OK }}>{msg}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {canEdit && <button className="btn btn-red" disabled={!dirty || busy} onClick={save}>{busy ? "…" : "Enregistrer"}</button>}
        {has(rights, "users") && f(u, "Actif") !== false && <button className="btn btn-dark" disabled={busy} onClick={invite}><i className="ti ti-mail" aria-hidden="true" />{f(u, "Profil complété") ? "Renvoyer un lien de connexion" : "Renvoyer l'invitation"}</button>}
        {canEdit && !isSelf && <button className="btn btn-ghost" disabled={busy} onClick={toggleActif}>{f(u, "Actif") !== false ? "Désactiver" : "Réactiver"}</button>}
      </div>
    </div>
  );
}

function NewUser({ d, rights, reload, onDone, onCancel }) {
  const [email, setEmail] = useState("");
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [roles, setRoles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const create = async () => {
    const mail = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) { setErr("Adresse e-mail invalide."); return; }
    if (d.users.some((u) => String(f(u, "Email") || "").toLowerCase() === mail)) { setErr("Cette adresse a déjà un accès."); return; }
    setBusy(true); setErr("");
    try {
      const locked = d.roles.filter(isLocked).map((r) => r.id);
      const fields = { "Email": mail, "Prénom": prenom.trim(), "Nom": nom.trim(), "Actif": true, "Profil complété": false, "Rôles": roles, "Rôle": roles.some((id) => locked.includes(id)) ? "Admin" : "Équipier" };
      const j = await db({ action: "create", table: "Utilisateurs", fields });
      const rec = (j.records || [])[0];
      let note = "";
      if (rec) { try { await authApi("invite", { userId: rec.id }); } catch (e) { note = " (le mail d'invitation n'est pas parti : " + e.message + ")"; } }
      await reload();
      alert("Accès créé pour " + mail + "." + (note || " Un mail lui permet de choisir son mot de passe."));
      onDone(rec && rec.id);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <div className="card" style={{ borderLeft: "4px solid " + RED, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 17, fontWeight: 800, color: TEXT }}>Inviter une personne</div>
      <div><label className="lbl" htmlFor="nu-mail">Adresse e-mail</label><input id="nu-mail" className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom@exemple.com" /></div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><label className="lbl" htmlFor="nu-pre">Prénom</label><input id="nu-pre" className="inp" value={prenom} onChange={(e) => setPrenom(e.target.value)} /></div>
        <div style={{ flex: 1 }}><label className="lbl" htmlFor="nu-nom">Nom</label><input id="nu-nom" className="inp" value={nom} onChange={(e) => setNom(e.target.value)} /></div>
      </div>
      <Section title="RÔLES"><RolesPicker d={d} value={roles} onChange={setRoles} rights={rights} /></Section>
      <div style={{ fontSize: 12.5, color: MUT, lineHeight: 1.5 }}>Tu pourras ensuite la rattacher à ses équipes et ajuster ses droits. Elle reçoit un mail pour choisir son mot de passe (lien valable 7 jours).</div>
      {err && <div role="alert" style={{ color: RED, fontSize: 13 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-red" disabled={busy} onClick={create}>{busy ? "Création…" : "Créer l'accès et envoyer l'invitation"}</button>
        <button className="btn btn-ghost" onClick={onCancel}>Annuler</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Rôles
function RolesPanel({ d, rights, reload }) {
  const [sel, setSel] = useState((d.roles[0] || {}).id || null);
  const role = d.roles.find((r) => r.id === sel) || null;
  const count = (r) => d.users.filter((u) => (f(u, "Rôles") || []).includes(r.id)).length;
  const canEdit = has(rights, "roles");
  const add = async () => {
    try {
      const j = await db({ action: "create", table: "Rôles", fields: { "Nom": "Nouveau rôle", "Couleur": "#5E646D", "Portée": "Ses équipes", "Droits": [], "Ordre": d.roles.length + 1 } });
      await reload(); setSel(((j.records || [])[0] || {}).id);
    } catch (e) { alert("Erreur : " + e.message); }
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
      <div style={{ flex: "1 1 280px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: TEXT, flex: 1 }}>Rôles</div>
          {canEdit && <button className="btn btn-red" onClick={add}><i className="ti ti-plus" aria-hidden="true" />Créer un rôle</button>}
        </div>
        {d.roles.map((r) => <button key={r.id} onClick={() => setSel(r.id)} aria-pressed={sel === r.id} className="card" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", cursor: "pointer", fontFamily: "inherit", textAlign: "left", borderLeft: "4px solid " + (sel === r.id ? RED : "#fff") }}>
          <span style={{ width: 12, height: 12, borderRadius: 6, background: f(r, "Couleur") || MUT }} />
          <span style={{ flex: 1 }}><span style={{ display: "block", fontWeight: 800, fontSize: 14.5, color: TEXT }}>{isLocked(r) && <i className="ti ti-lock" aria-hidden="true" style={{ marginRight: 4 }} />}{f(r, "Nom")}</span>
            <span style={{ fontSize: 12.5, color: MUT }}>{count(r)} pers. · {isLocked(r) ? "tous les droits" : (f(r, "Droits") || []).length + " droit(s)"} · {f(r, "Portée") === "Toutes" ? "toutes les équipes" : "ses équipes"}</span></span>
        </button>)}
      </div>
      <div style={{ flex: "999 1 520px", minWidth: 0 }}>{role ? <RoleEditor key={role.id} role={role} d={d} canEdit={canEdit && !isLocked(role)} count={count(role)} reload={reload} onDeleted={() => setSel(null)} /> : <div className="card"><Empty>Choisis un rôle.</Empty></div>}</div>
    </div>
  );
}
function RoleEditor({ role, d, canEdit, count, reload, onDeleted }) {
  const [nom, setNom] = useState(f(role, "Nom") || "");
  const [couleur, setCouleur] = useState(f(role, "Couleur") || "#5E646D");
  const [portee, setPortee] = useState(f(role, "Portée") || "Ses équipes");
  const [droits, setDroits] = useState(f(role, "Droits") || []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const locked = isLocked(role);
  const save = async () => {
    if (!nom.trim()) { setMsg("Erreur : le rôle doit avoir un nom."); return; }
    if (d.roles.some((r) => r.id !== role.id && norm(f(r, "Nom")) === norm(nom))) { setMsg("Erreur : un rôle porte déjà ce nom."); return; }
    setBusy(true); setMsg("");
    try { await db({ action: "update", table: "Rôles", recordId: role.id, fields: { "Nom": nom.trim(), "Couleur": couleur, "Portée": portee, "Droits": droits } }); await reload(); setMsg("Enregistré. Le changement s'applique aux " + count + " personne(s) qui ont ce rôle, dans les 5 minutes."); }
    catch (e) { setMsg("Erreur : " + e.message); }
    setBusy(false);
  };
  const del = async () => {
    if (count > 0) { alert("Ce rôle est attribué à " + count + " personne(s). Retire-le d'abord dans Utilisateurs."); return; }
    if (!confirm("Supprimer le rôle « " + nom + " » ?")) return;
    try { await db({ action: "delete", table: "Rôles", recordId: role.id }); onDeleted(); await reload(); } catch (e) { alert("Erreur : " + e.message); }
  };
  return (
    <div className="card" style={{ borderLeft: "4px solid " + RED, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: "2 1 220px" }}><label className="lbl" htmlFor="ro-nom">Nom du rôle</label><input id="ro-nom" className="inp" value={nom} disabled={!canEdit} onChange={(e) => setNom(e.target.value)} style={{ fontWeight: 800 }} /></div>
        <div><div className="lbl">Équipes visibles</div><div role="group" aria-label="Portée" style={{ display: "flex", gap: 6 }}>
          {["Ses équipes", "Toutes"].map((p) => <button key={p} disabled={!canEdit} aria-pressed={portee === p} onClick={() => setPortee(p)} style={chipStyle(portee === p)}>{p}</button>)}
        </div></div>
      </div>
      <div><div className="lbl">Couleur</div><div role="group" aria-label="Couleur" style={{ display: "flex", gap: 8 }}>
        {COLORS.map((c) => <button key={c} disabled={!canEdit} aria-label={"Couleur " + c} aria-pressed={couleur === c} onClick={() => setCouleur(c)} style={{ width: 30, height: 30, borderRadius: 15, background: c, border: couleur === c ? "3px solid #fff" : "none", boxShadow: couleur === c ? "0 0 0 2px " + c : "none", cursor: canEdit ? "pointer" : "default" }} />)}
      </div></div>
      {locked && <div style={{ background: "#F4F5F8", borderRadius: 12, padding: "10px 12px", fontSize: 13.5, color: "#3A3F47" }}>Le rôle Administrateur a toujours tous les droits : il ne se modifie pas, pour que le club ne se retrouve jamais sans personne capable de gérer l'outil.</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>
        {RIGHT_GROUPS.map(([g, items]) => <div key={g} style={{ background: "#F8F9FB", borderRadius: 14, padding: 12 }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".06em", color: MUT, marginBottom: 4 }}>{g.toUpperCase()}</div>
          {items.map(([k, l]) => { const on = locked || droits.includes(k); return (
            <button key={k} type="button" disabled={!canEdit} aria-pressed={on} onClick={() => setDroits(on ? droits.filter((x) => x !== k) : droits.concat(k))} style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 38, width: "100%", border: "none", background: "transparent", padding: 0, cursor: canEdit ? "pointer" : "default", fontFamily: "inherit", textAlign: "left" }}>
              <Box on={on} disabled={!canEdit} /><span style={{ fontSize: 13.5, color: TEXT }}>{l}</span>
            </button>); })}
        </div>)}
      </div>
      {msg && <div role="status" style={{ fontSize: 13, color: msg.startsWith("Erreur") ? RED : OK }}>{msg}</div>}
      {canEdit && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", borderTop: "1px solid " + BORDER, paddingTop: 14 }}>
        <div style={{ flex: 1, fontSize: 13, color: MUT }}>{count} personne(s) ont ce rôle · chaque changement est inscrit au journal.</div>
        <button className="btn btn-ghost" onClick={del}>Supprimer</button>
        <button className="btn btn-red" disabled={busy} onClick={save}>{busy ? "…" : "Enregistrer"}</button>
      </div>}
    </div>
  );
}

// ---------------------------------------------------------------- Équipes & effectifs
function TeamsPanel({ d, rights, reload }) {
  const active = d.teams.filter((t) => !f(t, "Archivée"));
  const [sel, setSel] = useState((active[0] || {}).id || null);
  const [newName, setNewName] = useState("");
  const canEff = has(rights, "eff");
  const team = d.teams.find((t) => t.id === sel) || null;
  const efxOf = (tid) => d.efx.filter((e) => (f(e, "Équipe") || []).includes(tid));
  const addTeam = async () => {
    if (!newName.trim()) return;
    try { const j = await db({ action: "create", table: "Équipes", fields: { "Nom": newName.trim(), "Saison": SAISON, "Ordre": d.teams.length + 1 } }); setNewName(""); await reload(); setSel(((j.records || [])[0] || {}).id); }
    catch (e) { alert("Erreur : " + e.message); }
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
      <div style={{ flex: "1 1 240px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#3A3F47", padding: "0 4px" }}>Saison {SAISON}</div>
        {active.map((t) => { const n = efxOf(t.id).filter((e) => !f(e, "Sortie")).length; const st = d.staff.filter((s) => (f(s, "Équipe") || []).includes(t.id)).length; return (
          <button key={t.id} onClick={() => setSel(t.id)} aria-pressed={sel === t.id} className="card" style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", cursor: "pointer", fontFamily: "inherit", textAlign: "left", borderLeft: "4px solid " + (sel === t.id ? RED : "#fff") }}>
            <span style={{ flex: 1 }}><span style={{ display: "block", fontWeight: 800, fontSize: 14.5, color: TEXT }}>{f(t, "Nom")}</span><span style={{ fontSize: 12.5, color: MUT }}>{n} joueur(s) · {st} staff</span></span>
            {f(t, "Primes actives") && <span style={{ fontSize: 11, fontWeight: 800, background: "#FFF6D6", color: "#6B4A00", borderRadius: 9, padding: "4px 8px" }}>Primes</span>}
          </button>); })}
        {!active.length && <Empty>Aucune équipe pour l'instant.</Empty>}
        {canEff && <div style={{ display: "flex", gap: 6 }}>
          <label htmlFor="nt" style={{ position: "absolute", left: -9999 }}>Nouvelle équipe</label>
          <input id="nt" className="inp" placeholder="Nouvelle équipe (ex. U15 F)" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTeam()} />
          <button className="btn btn-dark" onClick={addTeam} aria-label="Créer l'équipe"><i className="ti ti-plus" aria-hidden="true" /></button>
        </div>}
      </div>
      <div style={{ flex: "999 1 600px", minWidth: 0 }}>{team ? <TeamDetail key={team.id} team={team} d={d} rights={rights} reload={reload} /> : <div className="card"><Empty>Choisis ou crée une équipe.</Empty></div>}</div>
    </div>
  );
}

function TeamDetail({ team, d, rights, reload }) {
  const canEff = has(rights, "eff"), canParam = has(rights, "param");
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({ nom: f(team, "Nom") || "", cat: f(team, "Catégorie") || "", primes: !!f(team, "Primes actives"), pp: f(team, "Prime présence") ?? "", pv: f(team, "Prime victoire") ?? "", exc: f(team, "Excusé compte comme") || "Absence" });
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [card, setCard] = useState(null);
  const efx = d.efx.filter((e) => (f(e, "Équipe") || []).includes(team.id));
  const player = (e) => d.players.find((p) => p.id === (f(e, "Joueur") || [])[0]);
  const teamName = (id) => f(d.teams.find((t) => t.id === id), "Nom") || "?";
  const alsoIn = (pid) => d.efx.filter((e) => (f(e, "Joueur") || []).includes(pid) && !(f(e, "Équipe") || []).includes(team.id) && !f(e, "Sortie")).map((e) => teamName((f(e, "Équipe") || [])[0]));
  const staff = d.staff.filter((s) => (f(s, "Équipe") || []).includes(team.id));
  const rows = efx.map((e) => ({ e, p: player(e) })).filter(({ e, p }) => {
    if (filter === "eff" && (f(e, "Statut") !== "Effectif" || f(e, "Sortie"))) return false;
    if (filter === "ren" && f(e, "Statut") !== "Renfort") return false;
    if (filter === "out" && !f(e, "Sortie")) return false;
    if (filter !== "out" && filter !== "all" && f(e, "Sortie")) return false;
    if (q && !norm((p ? f(p, "Prénom") + " " + f(p, "Nom") : "")).includes(norm(q))) return false;
    return true;
  }).sort((a, b) => norm(a.p && f(a.p, "Nom")).localeCompare(norm(b.p && f(b.p, "Nom"))));
  const saveTeam = async () => {
    setBusy(true);
    const fields = canEff ? { "Nom": form.nom.trim() || f(team, "Nom"), "Catégorie": form.cat.trim() } : {};
    if (canParam) Object.assign(fields, { "Primes actives": form.primes, "Prime présence": form.pp === "" ? null : Number(form.pp), "Prime victoire": form.pv === "" ? null : Number(form.pv), "Excusé compte comme": form.exc });
    try { await db({ action: "update", table: "Équipes", recordId: team.id, fields }); setEdit(false); await reload(); } catch (e) { alert("Erreur : " + e.message); }
    setBusy(false);
  };
  const archive = async () => {
    if (!confirm("Archiver l'équipe « " + f(team, "Nom") + " » ? Elle disparaîtra des listes, son historique est conservé.")) return;
    try { await db({ action: "update", table: "Équipes", recordId: team.id, fields: { "Archivée": true } }); await reload(); } catch (e) { alert("Erreur : " + e.message); }
  };
  const updEfx = async (e, fields) => {
    try { await db({ action: "update", table: "Effectifs", recordId: e.id, fields }); await reload(); } catch (er) { alert("Erreur : " + er.message); }
  };
  const removeEfx = async (e, p) => {
    if (!confirm("Retirer " + (p ? f(p, "Prénom") + " " + f(p, "Nom") : "ce joueur") + " de l'équipe ? (Pour un départ en cours de saison, indique plutôt une date de sortie : son historique reste juste.)")) return;
    try { await db({ action: "delete", table: "Effectifs", recordId: e.id }); await reload(); } catch (er) { alert("Erreur : " + er.message); }
  };
  const FILT = [["all", "Tous"], ["eff", "Effectif"], ["ren", "Renfort"], ["out", "Sortis"]];
  const actifs = efx.filter((e) => !f(e, "Sortie"));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {!edit ? <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: TEXT }}>{f(team, "Nom")}</div>
            <div style={{ fontSize: 13, color: MUT }}>{[f(team, "Catégorie"), f(team, "Saison"), actifs.length + " joueur(s)", f(team, "Primes actives") ? "primes : " + (f(team, "Prime présence") ?? "—") + " € présence · " + (f(team, "Prime victoire") ?? "—") + " € victoire" : "sans primes"].filter(Boolean).join(" · ")}</div>
          </div>
          {(canEff || canParam) && <button className="btn btn-ghost" onClick={() => setEdit(true)}><i className="ti ti-pencil" aria-hidden="true" />Modifier</button>}
        </div> : <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: "2 1 200px" }}><label className="lbl" htmlFor="tm-nom">Nom</label><input id="tm-nom" className="inp" value={form.nom} disabled={!canEff} onChange={(e) => setForm({ ...form, nom: e.target.value })} /></div>
            <div style={{ flex: "1 1 140px" }}><label className="lbl" htmlFor="tm-cat">Catégorie</label><input id="tm-cat" className="inp" value={form.cat} disabled={!canEff} onChange={(e) => setForm({ ...form, cat: e.target.value })} placeholder="ex. Seniors M" /></div>
          </div>
          {canParam && <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, minHeight: 44, cursor: "pointer" }}><input type="checkbox" checked={form.primes} onChange={(e) => setForm({ ...form, primes: e.target.checked })} style={{ width: 18, height: 18, accentColor: RED }} />Primes actives</label>
            <div style={{ flex: "1 1 120px" }}><label className="lbl" htmlFor="tm-pp">Prime de présence (€ / mois)</label><input id="tm-pp" className="inp" type="number" min="0" step="0.5" value={form.pp} disabled={!form.primes} onChange={(e) => setForm({ ...form, pp: e.target.value })} /></div>
            <div style={{ flex: "1 1 120px" }}><label className="lbl" htmlFor="tm-pv">Prime de victoire (€)</label><input id="tm-pv" className="inp" type="number" min="0" step="0.5" value={form.pv} disabled={!form.primes} onChange={(e) => setForm({ ...form, pv: e.target.value })} /></div>
            <div style={{ flex: "1 1 200px" }}><label className="lbl" htmlFor="tm-exc">Une absence excusée compte comme</label><select id="tm-exc" className="sel" value={form.exc} disabled={!form.primes} onChange={(e) => setForm({ ...form, exc: e.target.value })}><option value="Absence">Une absence</option><option value="Séance non comptée">Une séance non comptée</option></select></div>
          </div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-red" disabled={busy} onClick={saveTeam}>Enregistrer</button>
            <button className="btn btn-ghost" onClick={() => setEdit(false)}>Annuler</button>
            {canEff && <button className="btn btn-ghost" style={{ marginLeft: "auto" }} onClick={archive}>Archiver l'équipe</button>}
          </div>
        </div>}
      </div>

      {card && <PlayerCard joueurId={card} onClose={() => setCard(null)} />}
      <div className="card" style={{ borderLeft: "4px solid #1B5E9B", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".06em", color: MUT }}>STAFF DE L'ÉQUIPE</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {staff.map((s) => { const u = d.users.find((x) => x.id === (f(s, "Personne") || [])[0]); return <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#F4F5F8", borderRadius: 12, padding: "7px 11px" }}>
            <span style={{ fontSize: 11.5, fontWeight: 800, color: MUT }}>{f(s, "Fonction") || "Staff"}</span><span style={{ fontSize: 14, fontWeight: 800 }}>{u ? fullName(u) : "?"}</span></div>; })}
          {!staff.length && <span style={{ fontSize: 13, color: MUT }}>Personne n'est encore rattaché à cette équipe.</span>}
        </div>
        <div style={{ fontSize: 12.5, color: MUT }}>Pour rattacher quelqu'un : Utilisateurs → sa fiche → « Rattacher à une équipe ».</div>
      </div>

      {(has(rights, "plan") || canEff) && <RhythmBlock team={team} d={d} reload={reload} />}

      {importing && <ImportPlayers team={team} d={d} reload={reload} onClose={() => setImporting(false)} />}
      {adding && <AddPlayer team={team} d={d} reload={reload} onClose={() => setAdding(false)} />}

      <div className="card" style={{ padding: 0 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "12px 14px", alignItems: "center" }}>
          <label htmlFor="pl-q" style={{ position: "absolute", left: -9999 }}>Rechercher un joueur</label>
          <input id="pl-q" className="inp" type="search" placeholder="Rechercher un joueur…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: "1 1 180px", width: "auto" }} />
          <div role="group" aria-label="Filtrer" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{FILT.map(([k, l]) => <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)} style={chipStyle(filter === k)}>{l}</button>)}</div>
          {canEff && <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
            <button className="btn btn-dark" onClick={() => { setImporting(true); setAdding(false); }}><i className="ti ti-file-import" aria-hidden="true" />Importer une liste</button>
            <button className="btn btn-red" onClick={() => { setAdding(true); setImporting(false); }}><i className="ti ti-plus" aria-hidden="true" />Ajouter un joueur</button>
          </div>}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead><tr>{["JOUEUR", "NÉ(E) EN", "STATUT", "ENTRÉE", "SORTIE", "AUSSI DANS", ""].map((h) => <th key={h} style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".06em", color: MUT, textAlign: "left", padding: "10px 12px", borderTop: "1px solid " + BORDER, borderBottom: "1px solid " + BORDER, whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map(({ e, p }) => <tr key={e.id} style={{ borderBottom: "1px solid #F0F1F4" }}>
                <td style={{ padding: "8px 12px", fontWeight: 700, whiteSpace: "nowrap" }}>{p ? <button className="linkbtn" title="Ouvrir la fiche du joueur" onClick={() => setCard(p.id)} style={{ background: "none", border: "none", padding: 0, font: "inherit", fontWeight: 700, color: TEXT, cursor: "pointer", textDecoration: "underline", textDecorationColor: "#C9CCD2", textUnderlineOffset: 3 }}>{(f(p, "Prénom") || "") + " " + (f(p, "Nom") || "")}</button> : "?"}</td>
                <td style={{ padding: "8px 12px", color: "#3A3F47" }}>{(p && f(p, "Année de naissance")) || "—"}</td>
                <td style={{ padding: "8px 12px" }}>{canEff ? <select aria-label="Statut" className="sel" value={f(e, "Statut") || "Effectif"} onChange={(ev) => updEfx(e, { "Statut": ev.target.value })} style={{ width: "auto", padding: "6px 8px" }}><option>Effectif</option><option>Renfort</option></select> : (f(e, "Statut") || "Effectif")}</td>
                <td style={{ padding: "8px 12px" }}>{canEff ? <input aria-label="Date d'entrée" type="date" className="inp" value={f(e, "Entrée") || ""} onChange={(ev) => updEfx(e, { "Entrée": ev.target.value || null })} style={{ width: "auto", padding: "6px 8px" }} /> : frDate(f(e, "Entrée"))}</td>
                <td style={{ padding: "8px 12px" }}>{canEff ? <input aria-label="Date de sortie" type="date" className="inp" value={f(e, "Sortie") || ""} onChange={(ev) => updEfx(e, { "Sortie": ev.target.value || null })} style={{ width: "auto", padding: "6px 8px" }} /> : frDate(f(e, "Sortie"))}</td>
                <td style={{ padding: "8px 12px", color: "#3A3F47", fontSize: 13 }}>{(p && alsoIn(p.id).join(", ")) || "—"}</td>
                <td style={{ padding: "8px 12px" }}>{canEff && <button className="btn btn-ghost" style={{ padding: "6px 9px" }} onClick={() => removeEfx(e, p)} aria-label="Retirer de l'équipe"><i className="ti ti-x" aria-hidden="true" /></button>}</td>
              </tr>)}
            </tbody>
          </table>
          {!rows.length && <Empty>{efx.length ? "Aucun joueur ne correspond." : "Aucun joueur dans cette équipe. Ajoute-les un par un ou importe une liste."}</Empty>}
        </div>
      </div>
    </div>
  );
}

async function findOrCreatePlayers(d, list) {
  // list : [{ prenom, nom, annee, licence }] → renvoie les ID de joueurs (existants réutilisés).
  const key = (p) => norm(p.nom) + "|" + norm(p.prenom) + "|" + (p.annee || "");
  const existing = new Map();
  d.players.forEach((p) => {
    const k = norm(f(p, "Nom")) + "|" + norm(f(p, "Prénom")) + "|" + (f(p, "Année de naissance") || "");
    existing.set(k, p.id);
    existing.set(norm(f(p, "Nom")) + "|" + norm(f(p, "Prénom")) + "|", p.id);
  });
  const toCreate = list.filter((p) => !existing.get(key(p)) && !existing.get(norm(p.nom) + "|" + norm(p.prenom) + "|"));
  if (toCreate.length) {
    const j = await db({ action: "create", table: "Joueurs", records: toCreate.map((p) => ({ fields: { "Nom": p.nom.trim(), "Prénom": p.prenom.trim(), ...(p.annee ? { "Année de naissance": Number(p.annee) } : {}), ...(p.licence ? { "Licence": p.licence } : {}) } })) });
    (j.records || []).forEach((r, i) => existing.set(key(toCreate[i]), r.id));
  }
  return list.map((p) => existing.get(key(p)) || existing.get(norm(p.nom) + "|" + norm(p.prenom) + "|"));
}

function AddPlayer({ team, d, reload, onClose }) {
  const [p, setP] = useState({ prenom: "", nom: "", annee: "", statut: "Effectif", entree: today() });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const dup = d.players.find((x) => norm(f(x, "Nom")) === norm(p.nom) && norm(f(x, "Prénom")) === norm(p.prenom) && p.nom && p.prenom);
  const inTeam = dup && d.efx.some((e) => (f(e, "Joueur") || []).includes(dup.id) && (f(e, "Équipe") || []).includes(team.id) && !f(e, "Sortie"));
  const save = async () => {
    if (!p.nom.trim() || !p.prenom.trim()) { setErr("Nom et prénom obligatoires."); return; }
    if (inTeam) { setErr("Ce joueur est déjà dans l'équipe."); return; }
    setBusy(true); setErr("");
    try {
      const [pid] = await findOrCreatePlayers(d, [p]);
      await db({ action: "create", table: "Effectifs", fields: { "Libellé": p.prenom.trim() + " " + p.nom.trim() + " — " + f(team, "Nom"), "Joueur": [pid], "Équipe": [team.id], "Statut": p.statut, "Entrée": p.entree || null } });
      await reload(); setP({ prenom: "", nom: "", annee: "", statut: p.statut, entree: p.entree });
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <div className="card" style={{ borderLeft: "4px solid " + RED, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center" }}><div style={{ fontWeight: 800, fontSize: 16, flex: 1 }}>Ajouter un joueur à {f(team, "Nom")}</div><button className="btn btn-ghost" onClick={onClose} aria-label="Fermer"><i className="ti ti-x" aria-hidden="true" /></button></div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 140px" }}><label className="lbl" htmlFor="ap-pre">Prénom</label><input id="ap-pre" className="inp" value={p.prenom} onChange={(e) => setP({ ...p, prenom: e.target.value })} /></div>
        <div style={{ flex: "1 1 140px" }}><label className="lbl" htmlFor="ap-nom">Nom</label><input id="ap-nom" className="inp" value={p.nom} onChange={(e) => setP({ ...p, nom: e.target.value })} /></div>
        <div style={{ flex: "0 1 110px" }}><label className="lbl" htmlFor="ap-an">Né(e) en</label><input id="ap-an" className="inp" type="number" min="1940" max="2030" value={p.annee} onChange={(e) => setP({ ...p, annee: e.target.value })} /></div>
        <div style={{ flex: "0 1 130px" }}><label className="lbl" htmlFor="ap-st">Statut</label><select id="ap-st" className="sel" value={p.statut} onChange={(e) => setP({ ...p, statut: e.target.value })}><option>Effectif</option><option>Renfort</option></select></div>
        <div style={{ flex: "0 1 160px" }}><label className="lbl" htmlFor="ap-in">Entrée dans l'équipe</label><input id="ap-in" className="inp" type="date" value={p.entree} onChange={(e) => setP({ ...p, entree: e.target.value })} /></div>
      </div>
      {dup && !inTeam && <div style={{ fontSize: 13, color: "#6B4A00", background: "#FFF6D6", borderRadius: 10, padding: "8px 10px" }}>Ce joueur existe déjà au club{d.efx.some((e) => (f(e, "Joueur") || []).includes(dup.id)) ? " (dans une autre équipe)" : ""} : sa fiche sera réutilisée.</div>}
      {err && <div role="alert" style={{ color: RED, fontSize: 13 }}>{err}</div>}
      <div><button className="btn btn-red" disabled={busy} onClick={save}>{busy ? "Ajout…" : "Ajouter"}</button></div>
    </div>
  );
}

// « RIBET » → « Ribet », « D'ANNA » → « D'Anna » (seulement si tout est en majuscules).
const tidy = (s) => { const x = String(s || "").trim(); return x && x === x.toUpperCase() && /[A-ZÀ-Ý]/.test(x) ? x.toLowerCase().replace(/(^|[\s'’-])([a-zà-ÿ])/g, (m0, a1, a2) => a1 + a2.toUpperCase()) : x; };
// Lecture d'une liste collée depuis Excel (colonnes séparées par des tabulations) ou d'un CSV.
export function parsePlayerList(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n").map((l) => l.trimEnd()).filter((l) => l.trim());
  if (!lines.length) return { rows: [], error: "" };
  const sep = lines[0].includes("\t") ? "\t" : (lines[0].split(";").length >= lines[0].split(",").length ? ";" : ",");
  const cells = lines.map((l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, "")));
  const head = cells[0].map(norm);
  const find = (...keys) => head.findIndex((h) => keys.some((k) => h.includes(k)));
  let iNom = find("nom de famille", "nom"), iPre = find("prenom"), iNai = find("naissance", "annee", "ne le", "ne(e)"), iLic = find("licence", "numero");
  if (iNom === iPre) iNom = head.findIndex((h, i) => h.includes("nom") && i !== iPre);
  let start = 1;
  if (iNom < 0 || iPre < 0) { iNom = 0; iPre = 1; iNai = cells[0].length > 2 ? 2 : -1; iLic = -1; start = 0; } // pas d'en-tête : Nom, Prénom, Naissance
  const rows = [];
  for (let i = start; i < cells.length; i++) {
    const c = cells[i];
    const nom = c[iNom] || "", prenom = c[iPre] || "";
    if (!nom && !prenom) continue;
    const rawN = iNai >= 0 ? (c[iNai] || "") : "";
    const m = rawN.match(/(19|20)\d\d/);
    rows.push({ nom: tidy(nom), prenom: tidy(prenom), annee: m ? m[0] : "", licence: iLic >= 0 ? (c[iLic] || "") : "" });
  }
  return { rows, error: rows.length ? "" : "Aucune ligne reconnue." };
}

function ImportPlayers({ team, d, reload, onClose }) {
  const [text, setText] = useState("");
  const [statut, setStatut] = useState("Effectif");
  const [entree, setEntree] = useState(today());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const parsed = useMemo(() => parsePlayerList(text), [text]);
  const inTeamIds = new Set(d.efx.filter((e) => (f(e, "Équipe") || []).includes(team.id) && !f(e, "Sortie")).flatMap((e) => f(e, "Joueur") || []));
  const status = (r) => {
    const ex = d.players.find((p) => norm(f(p, "Nom")) === norm(r.nom) && norm(f(p, "Prénom")) === norm(r.prenom));
    if (ex && inTeamIds.has(ex.id)) return "deja";
    return ex ? "club" : "nouveau";
  };
  const counts = parsed.rows.reduce((a, r) => { a[status(r)]++; return a; }, { nouveau: 0, club: 0, deja: 0 });
  const onFile = (e) => { const file = e.target.files && e.target.files[0]; if (!file) return; const rd = new FileReader(); rd.onload = () => setText(String(rd.result || "")); rd.readAsText(file, "utf-8"); };
  const go = async () => {
    const list = parsed.rows.filter((r) => status(r) !== "deja");
    if (!list.length) return;
    setBusy(true);
    try {
      const ids = await findOrCreatePlayers(d, list);
      await db({ action: "create", table: "Effectifs", records: list.map((r, i) => ({ fields: { "Libellé": r.prenom + " " + r.nom + " — " + f(team, "Nom"), "Joueur": [ids[i]], "Équipe": [team.id], "Statut": statut, "Entrée": entree || null } })) });
      await reload(); setDone(list.length + " joueur(s) ajouté(s) à " + f(team, "Nom") + "."); setText("");
    } catch (e) { alert("Erreur : " + e.message); }
    setBusy(false);
  };
  const LBL = { nouveau: ["Nouveau", "#E7F4EA", "#1F5C30"], club: ["Déjà au club", "#E6F0FB", "#1B5E9B"], deja: ["Déjà dans l'équipe", "#EEF0F3", MUT] };
  return (
    <div className="card" style={{ background: BLACK, color: "#fff", border: "none", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center" }}><div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".06em", color: YELLOW, flex: 1 }}>IMPORTER UNE LISTE DANS {String(f(team, "Nom")).toUpperCase()}</div><button className="btn" style={{ background: "transparent", color: "#fff" }} onClick={onClose} aria-label="Fermer"><i className="ti ti-x" aria-hidden="true" /></button></div>
      <div style={{ fontSize: 13.5, color: "#E3E5E8", lineHeight: 1.55 }}><b>1.</b> Dans Excel, sélectionne les colonnes <b>Nom</b>, <b>Prénom</b> et, si tu l'as, <b>Date de naissance</b> (avec la ligne de titres), copie, puis colle ci-dessous. Un fichier .csv marche aussi.</div>
      <label htmlFor="imp-txt" style={{ position: "absolute", left: -9999 }}>Liste à importer</label>
      <textarea id="imp-txt" className="ta" rows={5} value={text} onChange={(e) => { setText(e.target.value); setDone(""); }} placeholder={"Nom\tPrénom\tDate de naissance\nRIBET\tJérôme\t12/03/2003"} style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 13 }} />
      <label style={{ fontSize: 13, color: "#E3E5E8", display: "flex", alignItems: "center", gap: 8 }}>ou choisis un fichier .csv : <input type="file" accept=".csv,.txt,text/csv" onChange={onFile} style={{ color: "#fff" }} /></label>
      {parsed.rows.length > 0 && <>
        <div style={{ fontSize: 13.5, color: "#E3E5E8" }}><b>2.</b> Vérifie : {parsed.rows.length} ligne(s) reconnue(s) · {counts.nouveau} nouveau(x) · {counts.club} déjà au club (fiche réutilisée) · {counts.deja} déjà dans l'équipe (ignoré).</div>
        <div style={{ background: "#fff", color: TEXT, borderRadius: 12, maxHeight: 220, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}><tbody>
            {parsed.rows.map((r, i) => { const s = LBL[status(r)]; return <tr key={i} style={{ borderBottom: "1px solid #F0F1F4" }}><td style={{ padding: "6px 10px", fontWeight: 700 }}>{r.prenom} {r.nom}</td><td style={{ padding: "6px 10px", color: MUT }}>{r.annee || "—"}</td><td style={{ padding: "6px 10px" }}><span style={{ fontSize: 11.5, fontWeight: 800, background: s[1], color: s[2], borderRadius: 9, padding: "3px 8px" }}>{s[0]}</span></td></tr>; })}
          </tbody></table>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div><label className="lbl" htmlFor="imp-st" style={{ color: "#C9CCD2" }}>Statut pour tous</label><select id="imp-st" className="sel" value={statut} onChange={(e) => setStatut(e.target.value)} style={{ width: "auto" }}><option>Effectif</option><option>Renfort</option></select></div>
          <div><label className="lbl" htmlFor="imp-in" style={{ color: "#C9CCD2" }}>Date d'entrée pour tous</label><input id="imp-in" className="inp" type="date" value={entree} onChange={(e) => setEntree(e.target.value)} style={{ width: "auto" }} /></div>
          <button className="btn btn-yellow" disabled={busy || !(counts.nouveau + counts.club)} onClick={go}><b>3.</b>&nbsp;{busy ? "Import…" : "Valider l'import (" + (counts.nouveau + counts.club) + ")"}</button>
        </div>
      </>}
      {parsed.error && text.trim() && <div style={{ color: "#FFB4B4", fontSize: 13 }}>{parsed.error} Vérifie qu'il y a bien une colonne Nom et une colonne Prénom.</div>}
      {done && <div role="status" style={{ color: "#9BE1AE", fontSize: 13.5, fontWeight: 700 }}>✓ {done} Statuts et dates restent modifiables dans le tableau.</div>}
    </div>
  );
}

// ---------------------------------------------------------------- Rythme d'entraînement & séances
const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const seasonEnd = () => SAISON.slice(5) + "-06-30";
function ymdLocal(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
export function datesFor(rythme, from, to) {
  const idx = JOURS.indexOf(f(rythme, "Jour")); if (idx < 0) return [];
  const start = [from, f(rythme, "Du")].filter(Boolean).sort().pop();
  const end = [to, f(rythme, "Au")].filter(Boolean).sort()[0];
  const out = []; const d = new Date(start + "T12:00:00");
  while (((d.getDay() + 6) % 7) !== idx) d.setDate(d.getDate() + 1);
  for (; ymdLocal(d) <= end; d.setDate(d.getDate() + 7)) out.push(ymdLocal(d));
  return out;
}
const inVac = (date) => VACANCES_DEFAUT.find((v) => date >= v.du && date <= v.au);
function RhythmBlock({ team, d, reload }) {
  const rythmes = d.rythmes.filter((r) => (f(r, "Équipe") || []).includes(team.id)).sort((a, b) => JOURS.indexOf(f(a, "Jour")) - JOURS.indexOf(f(b, "Jour")));
  const [nr, setNr] = useState({ jour: "Mardi", heure: "19:30", lieu: "" });
  const [busy, setBusy] = useState(false);
  const [gen, setGen] = useState({ du: today(), au: seasonEnd(), skipVac: false });
  const [cx, setCx] = useState({ du: "", au: "", motif: "Vacances" });
  const [seances, setSeances] = useState(null);
  const loadS = useCallback(() => {
    db({ action: "list", table: "Séances", filterByFormula: "IS_AFTER({Date}, '" + today().slice(0, 4) + "-01-01')" })
      .then((j) => setSeances((j.records || []).filter((s) => (f(s, "Équipe") || []).includes(team.id))), () => setSeances([]));
  }, [team.id]);
  useEffect(() => { loadS(); }, [loadS]);
  const addR = async () => {
    setBusy(true);
    try { await db({ action: "create", table: "Rythmes", fields: { "Libellé": f(team, "Nom") + " · " + nr.jour + " " + nr.heure, "Équipe": [team.id], "Jour": nr.jour, "Heure": nr.heure, "Lieu": nr.lieu, "Du": SAISON.slice(0, 4) + "-09-01", "Au": seasonEnd() } }); await reload(); } catch (e) { alert("Erreur : " + e.message); }
    setBusy(false);
  };
  const delR = async (r) => { if (!confirm("Supprimer ce créneau ? Les séances déjà créées restent.")) return; try { await db({ action: "delete", table: "Rythmes", recordId: r.id }); await reload(); } catch (e) { alert("Erreur : " + e.message); } };
  const existing = new Set((seances || []).map((s) => f(s, "Date") + "|" + (f(s, "Heure") || "")));
  const plan = rythmes.flatMap((r) => datesFor(r, gen.du, gen.au).filter((dt) => !(gen.skipVac && inVac(dt))).map((dt) => ({ r, dt }))).filter((x) => !existing.has(x.dt + "|" + (f(x.r, "Heure") || "")));
  const generate = async () => {
    if (!plan.length) return;
    if (!confirm("Créer " + plan.length + " séance(s) d'entraînement pour " + f(team, "Nom") + " ?")) return;
    setBusy(true);
    try {
      await db({ action: "create", table: "Séances", records: plan.map(({ r, dt }) => ({ fields: { "Libellé": f(team, "Nom") + " · Entraînement · " + dt, "Équipe": [team.id], "Date": dt, "Heure": f(r, "Heure") || "", "Lieu": f(r, "Lieu") || "", "Type": "Entraînement", "Statut": "Prévue", "Compte primes": true } })) });
      loadS(); alert(plan.length + " séance(s) créée(s). Elles apparaissent dans l'espace Sportif.");
    } catch (e) { alert("Erreur : " + e.message); }
    setBusy(false);
  };
  const toCancel = (seances || []).filter((s) => cx.du && cx.au && f(s, "Date") >= cx.du && f(s, "Date") <= cx.au && f(s, "Statut") === "Prévue");
  const cancelRange = async () => {
    if (!toCancel.length) return;
    if (!confirm("Annuler " + toCancel.length + " séance(s) du " + cx.du.split("-").reverse().join("/") + " au " + cx.au.split("-").reverse().join("/") + " ? Elles sortiront du calcul des primes.")) return;
    setBusy(true);
    try { for (const s of toCancel) await db({ action: "update", table: "Séances", recordId: s.id, fields: { "Statut": "Annulée", "Motif annulation": cx.motif } }); loadS(); }
    catch (e) { alert("Erreur : " + e.message); }
    setBusy(false);
  };
  const upcoming = (seances || []).filter((s) => f(s, "Date") >= today() && f(s, "Statut") !== "Annulée").length;
  return (
    <div className="card" style={{ borderLeft: "4px solid " + YELLOW, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center" }}><div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".06em", color: MUT, flex: 1 }}>RYTHME D'ENTRAÎNEMENT & PLANNING</div><span style={{ fontSize: 12.5, color: MUT }}>{seances ? upcoming + " séance(s) à venir" : "…"}</span></div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {rythmes.map((r) => <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#F4F5F8", borderRadius: 12, padding: "7px 10px" }}><span style={{ fontWeight: 800 }}>{f(r, "Jour")} {f(r, "Heure")}</span>{f(r, "Lieu") && <span style={{ fontSize: 12.5, color: MUT }}>{f(r, "Lieu")}</span>}<button className="btn btn-ghost" style={{ padding: "4px 8px" }} onClick={() => delR(r)} aria-label="Supprimer ce créneau"><i className="ti ti-x" aria-hidden="true" /></button></div>)}
        {!rythmes.length && <span style={{ fontSize: 13, color: MUT }}>Aucun créneau. Ajoute les jours et heures d'entraînement de l'équipe.</span>}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div><label className="lbl" htmlFor="ry-j">Jour</label><select id="ry-j" className="sel" value={nr.jour} onChange={(e) => setNr({ ...nr, jour: e.target.value })} style={{ width: "auto" }}>{JOURS.map((j) => <option key={j}>{j}</option>)}</select></div>
        <div><label className="lbl" htmlFor="ry-h">Heure</label><input id="ry-h" className="inp" type="time" value={nr.heure} onChange={(e) => setNr({ ...nr, heure: e.target.value })} style={{ width: "auto" }} /></div>
        <div style={{ flex: "1 1 140px" }}><label className="lbl" htmlFor="ry-l">Lieu (facultatif)</label><input id="ry-l" className="inp" value={nr.lieu} onChange={(e) => setNr({ ...nr, lieu: e.target.value })} /></div>
        <button className="btn btn-dark" disabled={busy} onClick={addR}><i className="ti ti-plus" aria-hidden="true" />Ajouter le créneau</button>
      </div>
      {rythmes.length > 0 && <div style={{ background: "#F8F9FB", borderRadius: 14, padding: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ width: "100%", fontSize: 13.5, fontWeight: 800 }}>Créer les séances</div>
        <div><label className="lbl" htmlFor="gn-d">Du</label><input id="gn-d" className="inp" type="date" value={gen.du} onChange={(e) => setGen({ ...gen, du: e.target.value })} style={{ width: "auto" }} /></div>
        <div><label className="lbl" htmlFor="gn-a">Au</label><input id="gn-a" className="inp" type="date" value={gen.au} onChange={(e) => setGen({ ...gen, au: e.target.value })} style={{ width: "auto" }} /></div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, minHeight: 44, cursor: "pointer" }}><input type="checkbox" checked={gen.skipVac} onChange={(e) => setGen({ ...gen, skipVac: e.target.checked })} style={{ width: 18, height: 18, accentColor: RED }} />Rien pendant les vacances scolaires</label>
        <button className="btn btn-red" disabled={busy || !plan.length || !seances} onClick={generate}>{plan.length ? "Créer " + plan.length + " séance(s)" : "Tout est déjà créé"}</button>
        <div style={{ width: "100%", fontSize: 12, color: MUT }}>Les séances déjà existantes (même date, même heure) ne sont pas recréées.</div>
      </div>}
      <div style={{ background: "#F8F9FB", borderRadius: 14, padding: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ width: "100%", fontSize: 13.5, fontWeight: 800 }}>Annuler une période</div>
        <div style={{ width: "100%", display: "flex", gap: 6, flexWrap: "wrap" }}>{VACANCES_DEFAUT.filter((v) => v.au >= today()).map((v) => <button key={v.nom} className="btn btn-ghost" style={{ padding: "6px 10px", fontSize: 12.5 }} onClick={() => setCx({ du: v.du, au: v.au, motif: "Vacances" })}>Vacances de {v.nom}</button>)}</div>
        <div><label className="lbl" htmlFor="cx-d">Du</label><input id="cx-d" className="inp" type="date" value={cx.du} onChange={(e) => setCx({ ...cx, du: e.target.value })} style={{ width: "auto" }} /></div>
        <div><label className="lbl" htmlFor="cx-a">Au</label><input id="cx-a" className="inp" type="date" value={cx.au} onChange={(e) => setCx({ ...cx, au: e.target.value })} style={{ width: "auto" }} /></div>
        <div><label className="lbl" htmlFor="cx-mo">Motif</label><select id="cx-mo" className="sel" value={cx.motif} onChange={(e) => setCx({ ...cx, motif: e.target.value })} style={{ width: "auto" }}>{["Vacances", "Gymnase indisponible", "Mise au repos", "Intempéries", "Autre"].map((m) => <option key={m}>{m}</option>)}</select></div>
        <button className="btn btn-dark" disabled={busy || !toCancel.length} onClick={cancelRange}>{toCancel.length ? "Annuler " + toCancel.length + " séance(s)" : "Aucune séance prévue sur la période"}</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Journal
function JournalPanel({ d }) {
  const [rows, setRows] = useState(null);
  const [tbl, setTbl] = useState("all");
  useEffect(() => { db({ action: "list", table: "Journal", sort: [{ field: "Date", direction: "desc" }] }).then((j) => setRows(j.records || []), () => setRows([])); }, []);
  if (!rows) return <div className="card"><Empty>Chargement du journal…</Empty></div>;
  const tables = [...new Set(rows.map((r) => f(r, "Table")).filter(Boolean))];
  const vis = rows.filter((r) => tbl === "all" || f(r, "Table") === tbl).slice(0, 300);
  const who = (r) => { const u = d.users.find((x) => x.id === (f(r, "Auteur") || [])[0]); return u ? fullName(u) : "—"; };
  const when = (s) => { if (!s) return ""; const x = new Date(s); return x.toLocaleDateString("fr-FR") + " " + x.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); };
  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "12px 14px", alignItems: "center" }}>
        <div style={{ fontSize: 18, fontWeight: 800, flex: 1 }}>Journal</div>
        {["all"].concat(tables).map((t) => <button key={t} aria-pressed={tbl === t} onClick={() => setTbl(t)} style={chipStyle(tbl === t)}>{t === "all" ? "Tout" : t}</button>)}
      </div>
      {!vis.length && <Empty>Aucune action enregistrée pour l'instant.</Empty>}
      {vis.map((r) => <div key={r.id} style={{ display: "flex", gap: 12, padding: "10px 14px", borderTop: "1px solid #F0F1F4", flexWrap: "wrap", fontSize: 13.5 }}>
        <span style={{ color: MUT, minWidth: 120 }}>{when(f(r, "Date"))}</span>
        <span style={{ fontWeight: 800, minWidth: 140 }}>{who(r)}</span>
        <span style={{ minWidth: 160 }}>{f(r, "Action")} · {f(r, "Table")}</span>
        <span style={{ color: MUT, flex: "1 1 200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={f(r, "Détail") || ""}>{f(r, "Détail") || ""}</span>
      </div>)}
    </div>
  );
}
