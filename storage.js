// Adaptateur de stockage de l'appli VHB.
// - Clés "partagées" (shared = true)  -> Airtable, via la fonction serveur /api/state
// - Clés "locales"   (shared = false) -> navigateur de chaque personne (localStorage)
// Le jeton Airtable n'est JAMAIS ici : il reste côté serveur (voir api/state.js).
(function () {
  async function apiGet() {
    const res = await fetch("/api/state");
    if (!res.ok) throw new Error("GET /api/state " + res.status);
    return res.json(); // -> objet { gestion:{...}, secretariat:{...}, ... }
  }
  async function apiSet(dataObj) {
    const res = await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dataObj),
    });
    if (!res.ok) throw new Error("POST /api/state " + res.status);
    return res.json();
  }

  window.storage = {
    async get(key, shared) {
      if (shared) {
        const data = await apiGet();
        return { value: JSON.stringify(data) };
      }
      const v = localStorage.getItem(key);
      return v == null ? null : { value: v };
    },
    async set(key, value, shared) {
      if (shared) {
        const dataObj = typeof value === "string" ? JSON.parse(value) : value;
        await apiSet(dataObj);
        return;
      }
      localStorage.setItem(key, value);
    },
  };
})();
