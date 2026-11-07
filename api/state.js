// Ancienne fonction de sauvegarde, plus utilisée par l'appli depuis le passage à /api/db.
// Désactivée : elle donnait un accès non protégé à la base.
export default function handler(req, res) {
  res.status(410).json({ error: "Fonction retirée." });
}
