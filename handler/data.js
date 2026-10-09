// Petite base de données JSON (threadsData / usersData) compatible avec les commandes GoatBot
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "data");

function lire(fichier, defaut) {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, fichier), "utf8")); } catch (e) { return defaut; }
}

let threads = lire("threads.json", {});
let users = lire("users.json", {});
let planifie = false;

function sauvegarder() {
  if (planifie) return;
  planifie = true;
  const t = setTimeout(() => {
    planifie = false;
    try {
      fs.mkdirSync(DIR, { recursive: true });
      fs.writeFileSync(path.join(DIR, "threads.json"), JSON.stringify(threads));
      fs.writeFileSync(path.join(DIR, "users.json"), JSON.stringify(users));
    } catch (e) {
      console.error("⚠️ Sauvegarde des données impossible :", e.message);
    }
  }, 10000);
  if (t.unref) t.unref();
}

const threadsData = {
  async getAll() { return Object.values(threads); },
  async get(id) { return threads[String(id)] || null; },
  async set(id, data) {
    threads[String(id)] = { ...(threads[String(id)] || {}), threadID: String(id), ...data };
    sauvegarder();
  },
  touch(id, isGroup) {
    const k = String(id);
    const t = threads[k];
    if (!t || t.isGroup !== !!isGroup) {
      threads[k] = { ...(t || {}), threadID: k, isGroup: !!isGroup, dernierMessage: Date.now() };
      sauvegarder();
    }
  }
};

const usersData = {
  async get(id) { return users[String(id)] || null; },
  async set(id, data) {
    users[String(id)] = { ...(users[String(id)] || {}), userID: String(id), ...data };
    sauvegarder();
  },
  async getName(id, api) {
    const k = String(id);
    if (users[k] && users[k].name) return users[k].name;
    if (api && typeof api.getUserInfo === "function") {
      const nom = await new Promise((res) => {
        const to = setTimeout(() => res(null), 6000);
        try {
          api.getUserInfo(k, (err, info) => {
            clearTimeout(to);
            res(err || !info || !info[k] ? null : info[k].name);
          });
        } catch (e) { clearTimeout(to); res(null); }
      });
      if (nom) { await this.set(k, { name: nom }); return nom; }
    }
    return k;
  }
};

module.exports = { threadsData, usersData };
