const fs = require("fs");
const path = require("path");
const http = require("http");

try { require("dotenv").config(); } catch (e) {}

/* ---------- Serveur HTTP (Render voit un port ouvert ; un pinger peut garder le bot éveillé) ---------- */
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("ok");
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end("<h1>🤖 Bot Messenger actif !</h1><p>Le bot fonctionne correctement sur Render.</p>");
}).listen(PORT, () => console.log(`🌐 Serveur HTTP démarré sur le port ${PORT}`));

/* ---------- État global (compatible commandes GoatBot) ---------- */
function mapAvecExpiration(dureeMs) {
  const m = new Map();
  const set = m.set.bind(m);
  m.set = (k, v) => set(k, v && typeof v === "object" ? { ...v, _t: Date.now() } : v);
  setInterval(() => {
    const limite = Date.now() - dureeMs;
    for (const [k, v] of m) if (v && v._t && v._t < limite) m.delete(k);
  }, 10 * 60 * 1000).unref();
  return m;
}
global.GoatBot = {
  onReply: mapAvecExpiration(24 * 3600 * 1000),
  onReaction: mapAvecExpiration(24 * 3600 * 1000),
  startTime: Date.now()
};

/* ---------- Importation robuste de ws3-fca ---------- */
let login = require("ws3-fca");
if (typeof login !== "function") {
  if (login && typeof login.default === "function") login = login.default;
  else if (login && typeof login.login === "function") login = login.login;
}

/* ---------- Outils fichiers ---------- */
function chargerJsonSecurise(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.error(`❌ Erreur de lecture JSON (${filePath}) :`, error.message);
    return null;
  }
}

/* ---------- 1. Configuration (valeurs par défaut si une clé manque) ---------- */
const DEFAUTS = {
  botName: "Celestin Bot",
  prefix: "!",
  sansPrefixe: true,
  compteActif: "principal",
  botActif: true,
  repondreSeulementEnPv: false,
  owners: [],
  admins: [],
  banned: [],
  whitelistActive: false,
  whitelistThreads: [],
  whitelistUsers: []
};

const cheminConfig = path.join(__dirname, "config.json");
let configFichier = chargerJsonSecurise(cheminConfig);
if (!configFichier) {
  console.warn("⚠️ 'config.json' absent ou invalide : utilisation de la configuration par défaut.");
  configFichier = {};
}
const config = { ...DEFAUTS, ...configFichier };
// Variables d'environnement Render (facultatives) : ADMINS=id1,id2  OWNERS=id1  PREFIX=!
if (process.env.ADMINS) config.admins = process.env.ADMINS.split(",").map((s) => s.trim()).filter(Boolean);
if (process.env.OWNERS) config.owners = process.env.OWNERS.split(",").map((s) => s.trim()).filter(Boolean);
if (process.env.PREFIX) config.prefix = process.env.PREFIX;
global.GoatBot.config = config;

/* ---------- 2. Handler de commandes ---------- */
const { chargerCommandes, gererMessage, gererEvenement, lancerOnLoad, uniques } = require("./handler/handleMessage.js");

/* ---------- 3. Session Facebook (appstate) ---------- */
const nomCompte = config.compteActif || "principal";
const cheminAccounts = path.join(__dirname, "accounts");
fs.mkdirSync(cheminAccounts, { recursive: true });
const cheminAppstate = path.join(cheminAccounts, `${nomCompte}.json`);

/** Cherche l'appstate : accounts/<nom>.json, puis Secret Files Render, puis variable APPSTATE. */
function trouverAppstate() {
  const fichiers = [
    cheminAppstate,
    `/etc/secrets/${nomCompte}.json`,
    "/etc/secrets/appstate.json",
    path.join(__dirname, "appstate.json")
  ];
  for (const f of fichiers) {
    const data = chargerJsonSecurise(f);
    if (data && (Array.isArray(data) ? data.length : Object.keys(data).length)) {
      return { appstate: data, source: f };
    }
  }
  if (process.env.APPSTATE) {
    try { return { appstate: JSON.parse(process.env.APPSTATE), source: "variable APPSTATE" }; }
    catch (e) { console.error("❌ La variable APPSTATE n'est pas un JSON valide."); }
  }
  return null;
}

const trouve = trouverAppstate();
if (!trouve) {
  console.error(
    `❌ Aucune session Facebook trouvée pour le compte "${nomCompte}".\n` +
    `   Mets ton appstate dans l'un de ces endroits :\n` +
    `   - Render > Environment > Secret Files, nom : ${nomCompte}.json (ou appstate.json)\n` +
    `   - ou la variable d'environnement APPSTATE\n` +
    `   - ou le fichier accounts/${nomCompte}.json (dépôt privé uniquement !)`
  );
  process.exit(1);
}
console.log(`👤 Compte sélectionné : [${nomCompte}] (session lue depuis ${trouve.source})`);

/* ---------- 4. Chargement des commandes ---------- */
const cheminCommandes = path.join(__dirname, "commands");
const commandes = chargerCommandes(cheminCommandes);
global.GoatBot.commands = commandes;
console.log(`📦 ${uniques(commandes).length} commande(s) chargée(s) avec succès.`);

/* ---------- 5. Lancement du bot ---------- */
let arretEcoute = null;
let erreursRecentes = [];

function demarrerBot(tentative = 0) {
  if (typeof login !== "function") {
    console.error("❌ Impossible de charger la fonction 'login' de ws3-fca.");
    process.exit(1);
  }

  login({ appState: trouve.appstate }, async (err, api) => {
    if (err) {
      console.error("❌ Erreur de connexion Facebook :", (err && err.error) || (err && err.message) || err);
      if (tentative < 3) {
        console.log(`🔁 Nouvelle tentative dans 30 s (${tentative + 1}/3)...`);
        setTimeout(() => demarrerBot(tentative + 1), 30000);
      } else {
        console.error("🛑 Connexion impossible : l'appstate est probablement expiré. Génère-en un nouveau.");
        process.exit(1);
      }
      return;
    }

    api.setOptions({ listenEvents: true, selfListen: false, updatePresence: false, online: false });
    console.log(`✅ ${config.botName} connecté et opérationnel !`);

    try { await lancerOnLoad({ api, commandes }); }
    catch (e) { console.error("⚠️ onLoad :", e.message); }

    // Garde la session à jour (seulement si elle vient du dossier accounts/)
    if (trouve.source === cheminAppstate) {
      setInterval(() => {
        try { fs.writeFileSync(cheminAppstate, JSON.stringify(api.getAppState(), null, 2)); }
        catch (e) { /* silencieux */ }
      }, 10 * 60 * 1000).unref();
    }

    arretEcoute = api.listenMqtt(async (listenErr, event) => {
      if (listenErr) {
        console.error("⚠️ Erreur MQTT :", (listenErr && listenErr.message) || listenErr);
        const maintenant = Date.now();
        erreursRecentes = erreursRecentes.filter((t) => maintenant - t < 60000);
        erreursRecentes.push(maintenant);
        if (erreursRecentes.length >= 8) {
          console.error("🛑 Trop d'erreurs de connexion : redémarrage pour que Render relance le bot.");
          process.exit(1);
        }
        return;
      }
      if (!event) return;

      // Répond dans le groupe courant, ou seulement en privé si config.repondreSeulementEnPv
      const apiAdaptee = {
        ...api,
        sendMessage: (contents, threadID, callback, messageID) => {
          const destinataire = config.repondreSeulementEnPv ? event.senderID : (threadID || event.threadID);
          return api.sendMessage(contents, destinataire, callback, messageID);
        }
      };

      try {
        if (event.type === "message" || event.type === "message_reply") {
          await gererMessage({ api: apiAdaptee, event, config, commandes });
        } else if (event.type === "message_reaction" || event.type === "event") {
          await gererEvenement({ api: apiAdaptee, event, config, commandes });
        }
      } catch (cmdError) {
        console.error(`❌ Erreur d'exécution pour [${event.threadID}] :`, cmdError);
        try { apiAdaptee.sendMessage("❌ Une erreur interne est survenue.", event.threadID); } catch (e) {}
      }
    });
  });
}

/* ---------- Sécurité : le bot ne s'arrête pas pour une erreur isolée ---------- */
function arreter(signal) {
  console.log(`\n🛑 Arrêt du bot (${signal})...`);
  try { if (typeof arretEcoute === "function") arretEcoute(); } catch (e) {}
  process.exit(0);
}
process.on("SIGINT", () => arreter("SIGINT"));
process.on("SIGTERM", () => arreter("SIGTERM"));
process.on("uncaughtException", (error) => console.error("💥 Exception non capturée :", error));
process.on("unhandledRejection", (reason) => console.error("💥 Promesse rejetée non gérée :", reason));

demarrerBot();
