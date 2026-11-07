// Prévenir des personnes : cloche (toujours), notification sur le téléphone (sauf pendant la
// période de silence), e-mail (selon le choix de la personne et la demande de l'expéditeur).
import webpush from "web-push";
import { at, sendMail, mailWrap, RIGHTS } from "./_lib.js";

const T = (n) => encodeURIComponent(n);
export const DEFAULT_PREFS = { silence: true, de: "21:00", a: "08:00", mail: "demande" }; // mail : toujours | demande | jamais
const fv = (r, k) => ((r && r.fields) || {})[k];
export const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function prefsOf(user) {
  let p = {};
  try { p = JSON.parse(fv(user, "Préférences notifications") || "{}") || {}; } catch (e) { p = {}; }
  const o = { ...DEFAULT_PREFS, ...p };
  if (!/^\d{2}:\d{2}$/.test(o.de)) o.de = DEFAULT_PREFS.de;
  if (!/^\d{2}:\d{2}$/.test(o.a)) o.a = DEFAULT_PREFS.a;
  if (!["toujours", "demande", "jamais"].includes(o.mail)) o.mail = DEFAULT_PREFS.mail;
  o.silence = o.silence !== false;
  return o;
}
// Heure de Paris "HH:MM".
export function parisHM(date = new Date()) {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hour12: false }).format(date).replace("24:", "00:");
}
export function inSilence(prefs, date = new Date()) {
  if (!prefs.silence) return false;
  const hm = parisHM(date), de = prefs.de, a = prefs.a;
  if (de === a) return false;
  return de < a ? (hm >= de && hm < a) : (hm >= de || hm < a); // période qui passe minuit
}

// Droits d'une personne sans session (pour retrouver « le CA », « le support »…).
export function rightsOf(user, roles) {
  const fl = (user && user.fields) || {};
  const mine = roles.filter((r) => (fl["Rôles"] || []).includes(r.id));
  if (fl["Rôle"] === "Admin" || mine.some((r) => fv(r, "Verrouillé"))) return ["*"];
  const set = new Set((fl["Droits ajoutés"] || []).filter((x) => RIGHTS.includes(x)));
  mine.forEach((r) => (fv(r, "Droits") || []).forEach((d) => set.add(d)));
  if (!mine.length && !set.size && fl["Rôle"] === "Équipier") set.add("ca");
  return [...set];
}
export const hasRight = (rights, r) => rights.includes("*") || rights.includes(r);

async function sendPush(user, payload) {
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return 0;
  let list = [];
  try { list = JSON.parse(fv(user, "Push abonnements") || "[]"); } catch (e) { list = []; }
  if (!Array.isArray(list) || !list.length) return 0;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:direction@exya-formations.com", pub, priv);
  let sent = 0; const keep = [];
  for (const sub of list) {
    try { await webpush.sendNotification(sub, payload); sent++; keep.push(sub); }
    catch (err) { const c = err && err.statusCode; if (c !== 404 && c !== 410) keep.push(sub); }
  }
  if (keep.length !== list.length) { try { await at("PATCH", T("Utilisateurs"), { records: [{ id: user.id, fields: { "Push abonnements": JSON.stringify(keep) } }] }); } catch (e) {} }
  return sent;
}

/**
 * users      : fiches Utilisateurs complètes (préférences et abonnements lus ici)
 * title/body : texte court de la notification ; url : lien dans l'appli
 * mail       : { subject, html, cta, wanted } — wanted = l'expéditeur a demandé une copie par mail
 * Retourne { bell, push, mail, silenced }.
 */
export async function notifyUsers(users, { title, body, url, mail }) {
  const out = { bell: 0, push: 0, mail: 0, silenced: 0 };
  const recs = users.map((u) => ({ fields: { "Titre": String(title || "VHB Team").slice(0, 120), "Corps": String(body || "").slice(0, 400), "Lien": url || "/", "Date": new Date().toISOString(), "Destinataire": [u.id], "Lu": false } }));
  for (let i = 0; i < recs.length; i += 10) { try { await at("POST", T("Notifications"), { records: recs.slice(i, i + 10), typecast: true }); out.bell += recs.slice(i, i + 10).length; } catch (e) {} }
  const payload = JSON.stringify({ title: title || "VHB Team", body: String(body || "").slice(0, 180), url: url || "/" });
  for (const u of users) {
    const p = prefsOf(u);
    if (inSilence(p)) out.silenced++;
    else { try { out.push += await sendPush(u, payload); } catch (e) {} }
    const email = fv(u, "Email");
    if (mail && email && (p.mail === "toujours" || (p.mail === "demande" && mail.wanted))) {
      try { await sendMail(email, mail.subject || title, mailWrap(mail.title || title, mail.html || "", mail.cta)); out.mail++; } catch (e) {}
    }
  }
  return out;
}
