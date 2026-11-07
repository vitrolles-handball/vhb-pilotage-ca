// Envoi d'e-mails côté serveur via Resend. La clé (RESEND_API_KEY) reste ici — jamais exposée au navigateur.
// Réservé aux personnes connectées (dès que le verrou AUTH_ENFORCE vaut "1"), pour que
// personne ne puisse se servir du compte du club pour envoyer des mails.
// Sur les adresses de test, tous les mails partent vers MAIL_TEST_TO (voir _lib.js).
import { ENFORCE, getSession, sendMail, readBody } from "./_lib.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.status(405).json({ error: "POST uniquement" }); return; }
  const sess = await getSession(req, res);
  if (!sess && ENFORCE) { res.status(401).json({ error: "Session expirée : reconnecte-toi.", code: "auth" }); return; }
  const { to, subject, html } = readBody(req);
  if (!to || !subject) { res.status(400).json({ error: "Champs requis : to, subject." }); return; }
  const dest = Array.isArray(to) ? to : [to];
  if (dest.length > 60) { res.status(400).json({ error: "Trop de destinataires." }); return; }
  try {
    res.status(200).json(await sendMail(dest, subject, html || ""));
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
