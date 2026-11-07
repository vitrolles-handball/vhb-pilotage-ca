// Connexion à VHB Team : mot de passe, « mot de passe oublié », invitation, session.
// POST { action, ... } :
//   me        → la personne connectée (ou 401)
//   login     { email, password, remember }
//   logout
//   forgot    { email }            → envoie un lien pour (re)créer son mot de passe
//   reset     { token, password }  → enregistre le mot de passe et connecte
//   invite    { userId }           → (admin) envoie le lien de bienvenue
import {
  TOKEN, BASE, ENFORCE, T_USERS, getUser, findUserByEmail, updateUser, stripRecord,
  sign, verify, randomId, hashPassword, checkPassword, setSessionCookie, clearSessionCookie,
  getSession, isAdmin, sendMail, appUrl, mailWrap, readBody, tooMany, noteFailure, clearFailures,
} from "./_lib.js";

const MIN_LEN = 8;
const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const ip = (req) => String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "?";

async function sendLink(req, user, kind) {
  const jti = randomId(12);
  await updateUser(user.id, { "Jeton réinitialisation": jti });
  const life = kind === "invite" ? 7 * 86400000 : 30 * 60000;
  const token = sign({ t: "reset", u: user.id, j: jti, exp: Date.now() + life });
  const url = appUrl(req) + "/?reset=" + encodeURIComponent(token);
  const mail = (user.fields || {})["Email"];
  const prenom = (user.fields || {})["Prénom"];
  if (kind === "invite") {
    await sendMail(mail, "Ton accès à VHB Team — Tous Hand'semble", mailWrap(
      "Bienvenue sur VHB Team 🤾",
      '<p style="color:#444;line-height:1.55">' + (prenom ? "Bonjour " + esc(prenom) + ",<br>" : "") + "Un accès vient de t'être ouvert sur <b>VHB Team</b>, l'outil du club. Clique sur le bouton pour choisir ton mot de passe. Tu te connecteras ensuite avec <b>" + esc(mail) + "</b>.</p>"
      + '<p style="color:#888;font-size:12.5px">Ce lien est valable 7 jours et ne sert qu\'une fois.</p>',
      { url, label: "Créer mon mot de passe" }));
  } else {
    await sendMail(mail, "Ton mot de passe VHB Team", mailWrap(
      "Choisir un mot de passe",
      '<p style="color:#444;line-height:1.55">' + (prenom ? "Bonjour " + esc(prenom) + ",<br>" : "") + "Tu as demandé à créer ou à changer ton mot de passe VHB Team. Clique sur le bouton ci-dessous.</p>"
      + '<p style="color:#888;font-size:12.5px">Ce lien est valable 30 minutes et ne sert qu\'une fois. Si tu n\'as rien demandé, ignore simplement ce message : ton mot de passe actuel reste valable.</p>',
      { url, label: "Choisir mon mot de passe" }));
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!TOKEN || !BASE) { res.status(500).json({ error: "Configuration manquante." }); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "POST uniquement" }); return; }
  const b = readBody(req);
  const action = b.action;

  try {
    if (action === "me") {
      const s = await getSession(req, res);
      if (!s) { res.status(401).json({ error: "Non connecté.", enforce: ENFORCE }); return; }
      const u = await getUser(s.uid);
      if (!u || (u.fields || {})["Actif"] === false) { clearSessionCookie(res); res.status(401).json({ error: "Non connecté.", enforce: ENFORCE }); return; }
      res.status(200).json({ user: stripRecord(u), rights: s.rights, enforce: ENFORCE });
      return;
    }

    if (action === "logout") {
      clearSessionCookie(res);
      res.status(200).json({ ok: true });
      return;
    }

    if (action === "login") {
      const email = String(b.email || "").trim().toLowerCase();
      const pwd = String(b.password || "");
      const key = "login:" + email;
      if (!email || !pwd) { res.status(400).json({ error: "Indique ton e-mail et ton mot de passe." }); return; }
      if (tooMany(key) || tooMany("ip:" + ip(req), 30)) { res.status(429).json({ error: "Trop d'essais. Réessaie dans 15 minutes, ou utilise « Mot de passe oublié »." }); return; }
      const u = await findUserByEmail(email);
      const fl = (u && u.fields) || {};
      if (u && fl["Actif"] !== false && !fl["Mot de passe (chiffré)"]) {
        res.status(409).json({ error: "Tu n'as pas encore de mot de passe. Clique sur « Première connexion ou mot de passe oublié » pour le créer.", code: "nopassword" });
        return;
      }
      const ok = u && fl["Actif"] !== false && (await checkPassword(pwd, fl["Mot de passe (chiffré)"]));
      if (!ok) {
        noteFailure(key); noteFailure("ip:" + ip(req));
        res.status(401).json({ error: "E-mail ou mot de passe incorrect." });
        return;
      }
      clearFailures(key);
      setSessionCookie(res, u, !!b.remember);
      res.status(200).json({ user: stripRecord(u), enforce: ENFORCE });
      return;
    }

    if (action === "forgot") {
      const email = String(b.email || "").trim().toLowerCase();
      // Toujours la même réponse : on ne révèle pas si l'adresse existe.
      if (email && !tooMany("forgot:" + email, 3)) {
        noteFailure("forgot:" + email);
        const u = await findUserByEmail(email);
        if (u && (u.fields || {})["Actif"] !== false) await sendLink(req, u, "reset");
      }
      res.status(200).json({ ok: true });
      return;
    }

    if (action === "reset") {
      const p = verify(b.token);
      const pwd = String(b.password || "");
      if (!p || p.t !== "reset") { res.status(400).json({ error: "Ce lien n'est plus valable. Demande-en un nouveau.", code: "badlink" }); return; }
      if (pwd.length < MIN_LEN) { res.status(400).json({ error: "Le mot de passe doit faire au moins " + MIN_LEN + " caractères." }); return; }
      const u = await getUser(p.u);
      const fl = (u && u.fields) || {};
      if (!u || fl["Actif"] === false || !fl["Jeton réinitialisation"] || fl["Jeton réinitialisation"] !== p.j) {
        res.status(400).json({ error: "Ce lien a déjà servi ou n'est plus valable. Demande-en un nouveau.", code: "badlink" });
        return;
      }
      const hash = await hashPassword(pwd);
      const j = await updateUser(u.id, { "Mot de passe (chiffré)": hash, "Jeton réinitialisation": "" });
      const fresh = (j.records || [])[0] || u;
      setSessionCookie(res, fresh, true);
      res.status(200).json({ user: stripRecord(fresh), enforce: ENFORCE });
      return;
    }

    if (action === "invite") {
      const s = await getSession(req, res);
      // Pendant la transition (verrou éteint), un admin connecté « à l'ancienne »
      // n'a pas encore de session : on accepte alors l'invitation, comme avant.
      if (ENFORCE ? !isAdmin(s) : s && !isAdmin(s)) { res.status(403).json({ error: "Réservé aux administrateurs." }); return; }
      const u = await getUser(b.userId);
      if (!u || !(u.fields || {})["Email"]) { res.status(404).json({ error: "Utilisateur introuvable." }); return; }
      await sendLink(req, u, "invite");
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ error: "Action inconnue : " + action });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
