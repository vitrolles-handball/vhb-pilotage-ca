// Pont serveur sécurisé entre l'appli VHB et Airtable.
// Le jeton Airtable (AIRTABLE_TOKEN) reste ici, côté serveur — jamais exposé au navigateur.
// L'appli envoie des requêtes { action, table, ... } et reçoit les enregistrements.
const BASE = process.env.AIRTABLE_BASE_ID;
const TOKEN = process.env.AIRTABLE_TOKEN;

function url(path) {
  return "https://api.airtable.com/v0/" + BASE + "/" + path;
}

async function at(method, path, body) {
  const res = await fetch(url(path), {
    method,
    headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch (e) { json = { raw: text }; }
  if (!res.ok) throw new Error("Airtable " + res.status + " : " + text);
  return json;
}

export default async function handler(req, res) {
  if (!TOKEN || !BASE) {
    res.status(500).json({ error: "Configuration manquante (AIRTABLE_TOKEN / AIRTABLE_BASE_ID)." });
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST uniquement" });
    return;
  }
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  const { action, table, recordId, fields, records, filterByFormula, sort } = b || {};

  try {
    const t = encodeURIComponent(table);

    if (action === "list") {
      let all = [];
      let offset;
      do {
        const params = new URLSearchParams();
        params.set("pageSize", "100");
        if (offset) params.set("offset", offset);
        if (filterByFormula) params.set("filterByFormula", filterByFormula);
        if (sort) sort.forEach((s, i) => {
          params.set("sort[" + i + "][field]", s.field);
          if (s.direction) params.set("sort[" + i + "][direction]", s.direction);
        });
        const j = await at("GET", t + "?" + params.toString());
        all = all.concat(j.records || []);
        offset = j.offset;
      } while (offset);
      res.status(200).json({ records: all });
      return;
    }

    if (action === "create") {
      const payload = { records: records || [{ fields }], typecast: true };
      const j = await at("POST", t, payload);
      res.status(200).json(j);
      return;
    }

    if (action === "update") {
      const j = await at("PATCH", t, { records: [{ id: recordId, fields }], typecast: true });
      res.status(200).json(j);
      return;
    }

    if (action === "delete") {
      const j = await at("DELETE", t + "/" + recordId);
      res.status(200).json(j);
      return;
    }

    res.status(400).json({ error: "Action inconnue : " + action });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
