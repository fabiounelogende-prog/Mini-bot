const fs = require("fs");
const path = require("path");
const http = require("http");

// Serveur HTTP pour maintenir Render actif
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end("<h1>🤖 Bot Messenger actif !</h1><p>Le bot fonctionne correctement sur Render.</p>");
}).listen(PORT, () => {
  console.log(`🌐 Serveur HTTP démarré sur le port ${PORT}`);
});

// Importation robuste de ws3-fca
let login = require("ws3-fca");
if (typeof login !== "function") {
  if (login && typeof login.default === "function") {
    login = login.default;
  } else if (login && typeof login.login === "function") {
    login = login.login;
  }
}

/**
 * Lit de manière sécurisée un fichier JSON
 */
function chargerJsonSecurise(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    console.error(`❌ Erreur lors de la lecture du fichier JSON (${filePath}) :`, error.message);
    return null;
  }
}

// 1. Configuration
const cheminConfig = path.join(__dirname, "config.json");
const config = chargerJsonSecurise(cheminConfig);

if (!config) {
  console.error("❌ Impossible de charger 'config.json'.");
  process.exit(1);
}

// 2. Handler de commandes
const { chargerCommandes, gererMessage } = require("./handler/handleMessage.js");

// 3. Identification du compte
const nomCompte = config.compteActif || "principal";
const cheminAccounts = path.join(__dirname, "accounts");
if (!fs.existsSync(cheminAccounts)) {
  fs.mkdirSync(cheminAccounts, { recursive: true });
}

const cheminAppstate = path.join(cheminAccounts, `${nomCompte}.json`);

if (!fs.existsSync(cheminAppstate)) {
  console.error(`❌ Compte "${nomCompte}" introuvable dans accounts/ (${cheminAppstate}).`);
  process.exit(1);
}

console.log(`👤 Compte sélectionné : [${nomCompte}]`);

const appstate = chargerJsonSecurise(cheminAppstate);
if (!appstate) {
  console.error(`❌ Le fichier de session (${nomCompte}.json) est invalide.`);
  process.exit(1);
}

// 4. Chargement des commandes
const cheminCommandes = path.join(__dirname, "commands");
if (!fs.existsSync(cheminCommandes)) {
  fs.mkdirSync(cheminCommandes, { recursive: true });
}

const commandes = chargerCommandes(cheminCommandes);
console.log(`📦 ${commandes.size || 0} commande(s) chargée(s) avec succès.`);

/**
 * Lancement du bot
 */
function demarrerBot() {
  if (typeof login !== "function") {
    console.error("❌ Impossible de charger la fonction 'login' de ws3-fca.");
    process.exit(1);
  }

  login({ appState: appstate }, (err, api) => {
    if (err) {
      console.error("❌ Erreur de connexion Facebook :", err);
      return;
    }

    api.setOptions({
      listenEvents: true,
      selfListen: false,
      updatePresence: false,
      online: false
    });

    const nomBot = config.botName || "Celestin Bot";
    console.log(`✅ ${nomBot} connecté et opérationnel !`);

    api.listenMqtt(async (listenErr, event) => {
      if (listenErr) {
        console.error("⚠️ Erreur MQTT :", listenErr);
        return;
      }

      if (event.type !== "message" && event.type !== "message_reply") return;

      // Encapsulation de sendMessage pour répondre dans le groupe courant (threadID)
      const apiAdaptee = {
        ...api,
        sendMessage: (contents, threadID, callback, messageID) => {
          const destinataire = config.repondreSeulementEnPv ? event.senderID : (threadID || event.threadID);
          return api.sendMessage(contents, destinataire, callback, messageID);
        }
      };

      try {
        await gererMessage({ api: apiAdaptee, event, config, commandes });
      } catch (cmdError) {
        console.error(`❌ Erreur d'exécution pour [${event.threadID}] :`, cmdError);
        apiAdaptee.sendMessage("❌ Une erreur interne est survenue.", event.threadID);
      }
    });
  });
}

process.on("SIGINT", () => {
  console.log("\n🛑 Arrêt du bot...");
  process.exit(0);
});

process.on("uncaughtException", (error) => {
  console.error("💥 Exception non capturée :", error);
});

demarrerBot();

