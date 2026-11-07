// Outils serveur partagés par les fonctions /api (le "_" du nom empêche Vercel
// d'en faire une adresse publique).
//
//  • choix de la base Airtable (la base de TEST sur les adresses de prévisualisation) ;
//  • sessions signées dans un cookie HttpOnly (illisible par la page) ;
//  • mots de passe brouillés avec scrypt (jamais stockés ni renvoyés en clair) ;
//  • droits d'accès, calculés côté serveur ;
//  • envoi de mails, redirigés vers MAIL_TEST_TO sur les adresses de test.
import crypto from "node:crypto";

const IS_PREVIEW = process.env.VERCEL_ENV === "preview";
export const BASE = (IS_PREVIEW && process.env.TEST_AIRTABLE_BASE_ID) || process.env.AIRTABLE_BASE_ID;
export const TOKEN = process.env.AIRTABLE_TOKEN;
const SECRET = process.env.AUTH_SECRET || "";
// Verrou : tant qu'il vaut autre chose que "1", les anciens accès (sans session)
// restent tolérés, pour que personne ne soit bloqué pendant la transition.
export const ENFORCE = process.env.AUTH_ENFORCE === "1";

export const T_USERS = "Utilisateurs";
// Champs que le navigateur ne doit JAMAIS voir ni modifier.
export const SENSITIVE = ["Mot de passe (chiffré)", "Jeton réinitialisation"];

// ---------------------------------------------------------------- Airtable
export async function at(method, path, body) {
  const r = await fetch("https://api.airtable.com/v0/" + BASE + "/" + path, {
    method,
    headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch (e) { json = { raw: text }; }
  if (!r.ok) throw new Error("Airtable " + r.status + " : " + text);
  return json;
}
export async function getUser(id) {
  try { return await at("GET", encodeURIComponent(T_USERS) + "/" + encodeURIComponent(id)); }
  catch (e) { return null; }
}
export async function findUserByEmail(email) {
  const mail = String(email || "").trim().toLowerCase().replace(/'/g, "\\'");
  if (!mail) return null;
  const q = new URLSearchParams({ filterByFormula: "LOWER(TRIM({Email}))='" + mail + "'", pageSize: "2" });
  const j = await at("GET", encodeURIComponent(T_USERS) + "?" + q.toString());
  return (j.records || [])[0] || null;
}
export async function updateUser(id, fields) {
  return at("PATCH", encodeURIComponent(T_USERS), { records: [{ id, fields }], typecast: true });
}
export function stripRecord(rec) {
  if (!rec || !rec.fields) return rec;
  const fields = { ...rec.fields };
  SENSITIVE.forEach((k) => { delete fields[k]; });
  return { ...rec, fields };
}

// ---------------------------------------------------------------- Signature
const b64u = (buf) => Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const unb64u = (s) => Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");
export function sign(obj) {
  if (!SECRET) throw new Error("AUTH_SECRET manquant dans Vercel.");
  const body = b64u(JSON.stringify(obj));
  const mac = b64u(crypto.createHmac("sha256", SECRET).update(body).digest());
  return body + "." + mac;
}
export function verify(token) {
  if (!SECRET || !token || typeof token !== "string" || token.indexOf(".") < 0) return null;
  const [body, mac] = token.split(".");
  const good = b64u(crypto.createHmac("sha256", SECRET).update(body).digest());
  const a = Buffer.from(mac || ""), b = Buffer.from(good);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const obj = JSON.parse(unb64u(body).toString("utf8"));
    if (obj.exp && Date.now() > obj.exp) return null;
    return obj;
  } catch (e) { return null; }
}
export const randomId = (n = 18) => b64u(crypto.randomBytes(n));

// ---------------------------------------------------------------- Mots de passe
const SCRYPT = { N: 16384, r: 8, p: 1 };
function scryptAsync(pwd, salt) {
  return new Promise((resolve, reject) => crypto.scrypt(pwd, salt, 32, SCRYPT, (e, k) => (e ? reject(e) : resolve(k))));
}
export async function hashPassword(pwd) {
  const salt = crypto.randomBytes(16);
  const key = await scryptAsync(String(pwd), salt);
  return "scrypt$" + b64u(salt) + "$" + b64u(key);
}
export async function checkPassword(pwd, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const key = await scryptAsync(String(pwd), unb64u(parts[1]));
  const ref = unb64u(parts[2]);
  return key.length === ref.length && crypto.timingSafeEqual(key, ref);
}
// Petite empreinte du mot de passe enregistrée dans la session : si le mot de
// passe change, toutes les anciennes sessions tombent d'elles-mêmes.
export const pwdVersion = (stored) => crypto.createHash("sha256").update(String(stored || "")).digest("hex").slice(0, 12);

// ---------------------------------------------------------------- Cookies & sessions
const COOKIE = "vhb_s";
const DAY = 86400000;
const RECHECK_MS = 5 * 60 * 1000; // relecture de la fiche (actif ? rôle ?) toutes les 5 min

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || "").split(";").forEach((p) => {
    const i = p.indexOf("="); if (i < 0) return;
    out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function appendCookie(res, value) {
  const prev = res.getHeader("Set-Cookie");
  const list = prev ? (Array.isArray(prev) ? prev : [prev]) : [];
  res.setHeader("Set-Cookie", list.concat(value));
}
export async function setSessionCookie(res, user, remember) {
  const stored = (user.fields || {})["Mot de passe (chiffré)"];
  const now = Date.now();
  const life = remember ? 30 * DAY : 12 * 3600000;
  const acc = await computeAccess(user);
  const payload = { u: user.id, ri: acc.rights, sc: acc.scope, tm: acc.teams, pv: pwdVersion(stored), rm: !!remember, ck: now, exp: now + life };
  const parts = [COOKIE + "=" + encodeURIComponent(sign(payload)), "Path=/", "HttpOnly", "Secure", "SameSite=Lax"];
  if (remember) parts.push("Max-Age=" + Math.floor(life / 1000));
  appendCookie(res, parts.join("; "));
  return payload;
}
export function clearSessionCookie(res) {
  appendCookie(res, COOKIE + "=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
}
// Renvoie la session valide ({ uid, rights, scope, teams }) ou null.
export async function getSession(req, res) {
  const tok = parseCookies(req)[COOKIE];
  const p = verify(tok);
  if (!p || !p.u) return null;
  let acc = { rights: p.ri || [], scope: p.sc || "mine", teams: p.tm || [] };
  if (Date.now() - (p.ck || 0) > RECHECK_MS) {
    const u = await getUser(p.u);
    const fl = (u && u.fields) || {};
    if (!u || fl["Actif"] === false || pwdVersion(fl["Mot de passe (chiffré)"]) !== p.pv) {
      clearSessionCookie(res);
      return null;
    }
    acc = await computeAccess(u);
    // Prolonge la vérification sans changer la date de fin de session.
    const np = { ...p, ri: acc.rights, sc: acc.scope, tm: acc.teams, ck: Date.now() };
    const parts = [COOKIE + "=" + encodeURIComponent(sign(np)), "Path=/", "HttpOnly", "Secure", "SameSite=Lax"];
    if (p.rm) parts.push("Max-Age=" + Math.max(0, Math.floor((p.exp - Date.now()) / 1000)));
    appendCookie(res, parts.join("; "));
  }
  return { uid: p.u, rights: acc.rights, scope: acc.scope, teams: acc.teams };
}

// ---------------------------------------------------------------- Droits
// Codes de droits (identiques aux choix des champs Airtable « Droits » et « Droits ajoutés »).
export const RIGHTS = ["ca", "point", "eff", "plan", "param", "corr", "valid", "compta", "msg", "msgall", "users", "roles", "support", "journal"];
const byIds = (ids) => "OR(" + ids.map((id) => "RECORD_ID()='" + String(id).replace(/'/g, "") + "'").join(",") + ")";
async function listByIds(table, ids) {
  if (!ids || !ids.length) return [];
  const q = new URLSearchParams({ filterByFormula: byIds(ids.slice(0, 50)), pageSize: "100" });
  try { const j = await at("GET", encodeURIComponent(table) + "?" + q.toString()); return j.records || []; }
  catch (e) { return []; }
}
// Droits d'une personne = droits de ses rôles + droits ajoutés à la main.
// Rôle verrouillé (Administrateur) ou ancien rôle « Admin » → tous les droits ("*").
// Portée : « Toutes » si un de ses rôles le prévoit ; sinon ses équipes (table Staff).
export async function computeAccess(user) {
  const fl = (user && user.fields) || {};
  const roles = await listByIds("Rôles", fl["Rôles"] || []);
  const extra = (fl["Droits ajoutés"] || []).filter((r) => RIGHTS.includes(r));
  let rights;
  if (fl["Rôle"] === "Admin" || roles.some((r) => r.fields && r.fields["Verrouillé"])) rights = ["*"];
  else {
    const set = new Set(extra);
    roles.forEach((r) => ((r.fields && r.fields["Droits"]) || []).forEach((d) => set.add(d)));
    // Transition : un membre sans rôle attribué garde l'accès au Pilotage du CA, comme avant.
    if (!roles.length && !set.size && fl["Rôle"] === "Équipier") set.add("ca");
    rights = [...set];
  }
  const scope = rights.includes("*") || roles.some((r) => r.fields && r.fields["Portée"] === "Toutes") ? "all" : "mine";
  const staff = await listByIds("Staff", fl["Staff"] || []);
  const teams = [...new Set(staff.flatMap((s) => (s.fields && s.fields["Équipe"]) || []))];
  return { rights, scope, teams };
}
export const can = (sess, right) => !!sess && (sess.rights.includes("*") || sess.rights.includes(right));
export const canAny = (sess, list) => list.some((r) => can(sess, r));
export const isAdmin = (sess) => !!sess && sess.rights.includes("*");
export const seesTeam = (sess, teamId) => !!sess && (sess.scope === "all" || (sess.teams || []).includes(teamId));

// Journal des actions sensibles (n'empêche jamais l'action si l'écriture échoue).
export async function logAction(sess, action, table, recordId, detail) {
  try {
    await at("POST", encodeURIComponent("Journal"), { records: [{ fields: {
      "Action": action, "Table": table || "", "Enregistrement": recordId || "",
      "Détail": typeof detail === "string" ? detail : JSON.stringify(detail || {}),
      "Auteur": sess && sess.uid ? [sess.uid] : [], "Date": new Date().toISOString(),
    } }], typecast: true });
  } catch (e) {}
}

// ---------------------------------------------------------------- Mails
export async function sendMail(to, subject, html) {
  const KEY = process.env.RESEND_API_KEY;
  const FROM = process.env.MAIL_FROM || "VHB Team <onboarding@resend.dev>";
  if (!KEY) throw new Error("RESEND_API_KEY manquante — e-mail non configuré pour l'instant.");
  let dest = Array.isArray(to) ? to : [to];
  let subj = subject;
  if (IS_PREVIEW && process.env.MAIL_TEST_TO) {
    subj = "[TEST → " + dest.join(", ") + "] " + subject;
    dest = [process.env.MAIL_TEST_TO];
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: dest, subject: subj, html: html || "" }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error("Resend " + r.status + " : " + text);
  try { return JSON.parse(text || "{}"); } catch (e) { return {}; }
}
export function appUrl(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return host ? "https://" + host : (process.env.APP_URL || "https://vhb-pilotage-ca.vercel.app");
}
export function mailWrap(title, bodyHtml, cta) {
  return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:auto;border:1px solid #eee;border-radius:14px;overflow:hidden">'
    + '<div style="background:#16171B;padding:18px 22px;color:#fff"><span style="font-weight:800;font-size:17px">VHB Team</span> <span style="color:#F5C518;font-size:12px">Tous Hand\'semble</span></div>'
    + '<div style="padding:22px">' + (title ? '<h2 style="margin:0 0 12px;font-size:18px;color:#16171B">' + title + '</h2>' : '') + bodyHtml
    + (cta ? '<p style="margin:22px 0 6px"><a href="' + cta.url + '" style="background:#D62828;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700;display:inline-block">' + cta.label + '</a></p>' : '')
    + '</div><div style="color:#9aa0a6;font-size:11px;padding:0 22px 16px">Vitrolles Handball Jeunes · message automatique</div></div>';
}

// ---------------------------------------------------------------- Divers
export function readBody(req) {
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  return b || {};
}
// Limiteur de tentatives (en mémoire de l'instance : un frein, pas un mur).
const ATTEMPTS = new Map();
export function tooMany(key, max = 8, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const list = (ATTEMPTS.get(key) || []).filter((t) => now - t < windowMs);
  ATTEMPTS.set(key, list);
  return list.length >= max;
}
export function noteFailure(key) {
  const list = ATTEMPTS.get(key) || [];
  list.push(Date.now());
  ATTEMPTS.set(key, list);
}
export const clearFailures = (key) => ATTEMPTS.delete(key);
