const fs = require("fs");
const path = require("path");

// Résolution robuste de l'import de ws3-fca (gestion de l'export CommonJS / ES Module)
let login = require("ws3-fca");
if (typeof login !== "function") {
  if (login && typeof login.default === "function") {
    login = login.default;
  } else if (login && typeof login.login === "function") {
    login = login.login;
  }
}

/**
 * Lit et parse de manière sécurisée un fichier JSON
 * @param {string} filePath - Chemin absolu du fichier JSON
 * @returns {object|null} - Le contenu parsé ou null en cas d'erreur
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

// 1. Chargement de la configuration principale
const cheminConfig = path.join(__dirname, "config.json");
const config = chargerJsonSecurise(cheminConfig);

if (!config) {
  console.error("❌ Impossible de charger 'config.json'. Vérifiez la présence et la syntaxe du fichier.");
  process.exit(1);
}

// 2. Import du handler de commandes
const { chargerCommandes, gererMessage } = require("./handler/handleMessage.js");

// 3. Détermination du profil/compte Facebook à utiliser
const nomCompte = config.compteActif || "principal";
const cheminAccounts = path.join(__dirname, "accounts");
if (!fs.existsSync(cheminAccounts)) {
  fs.mkdirSync(cheminAccounts, { recursive: true });
}

const cheminAppstate = path.join(cheminAccounts, `${nomCompte}.json`);

// 4. Vérification de l'existence de la session (appstate)
if (!fs.existsSync(cheminAppstate)) {
  console.error(`❌ Compte "${nomCompte}" introuvable dans le dossier accounts/ (${cheminAppstate}).`);
  console.error("👉 Connecte-toi une première fois avec tes cookies Facebook et enregistre-les dans ce fichier.");
  process.exit(1);
}

console.log(`👤 Compte sélectionné : [${nomCompte}]`);

const appstate = chargerJsonSecurise(cheminAppstate);
if (!appstate) {
  console.error(`❌ Le fichier de session (${nomCompte}.json) est corrompu ou invalide.`);
  process.exit(1);
}

// 5. Assurance de l'existence du dossier commands et chargement
const cheminCommandes = path.join(__dirname, "commands");
if (!fs.existsSync(cheminCommandes)) {
  fs.mkdirSync(cheminCommandes, { recursive: true });
  console.log("📁 Le dossier 'commands/' a été créé automatiquement.");
}

const commandes = chargerCommandes(cheminCommandes);
console.log(`📦 ${commandes.size || 0} commande(s) chargée(s) avec succès.`);

/**
 * Initialise la connexion à l'API Messenger et démarre l'écouteur MQTT
 */
function demarrerBot() {
  if (typeof login !== "function") {
    console.error("❌ Impossible de charger la fonction 'login' de ws3-fca.");
    process.exit(1);
  }

  login({ appState: appstate }, (err, api) => {
    if (err) {
      console.error("❌ Erreur critique lors de la connexion Facebook :", err);
      return;
    }

    // Options de confidentialité et comportement du bot
    api.setOptions({
      listenEvents: true,
      selfListen: false,
      updatePresence: false,
      online: false
    });

    const nomBot = config.botName || "GoatBot";
    console.log(`✅ ${nomBot} est désormais connecté et actif en écoute privée.`);

    // Écoute des événements Messenger via le protocole MQTT
    api.listenMqtt(async (listenErr, event) => {
      if (listenErr) {
        console.error("⚠️ Erreur sur le flux MQTT :", listenErr);
        return;
      }

      // Filtrage : uniquement les messages textes et réponses
      if (event.type !== "message" && event.type !== "message_reply") return;

      // Détection des messages privés (1-à-1)
      const estPrive = event.threadID === event.senderID;

      // Si configuré pour répondre uniquement en PV et que ce n'est pas un PV
      if (config.repondreSeulementEnPv && !estPrive) return;

      // Traitement du message via le handler
      try {
        await gererMessage({ api, event, config, commandes });
      } catch (cmdError) {
        console.error(`❌ Erreur d'exécution de commande pour [${event.threadID}] :`, cmdError);
        api.sendMessage("❌ Une erreur interne est survenue lors du traitement de votre commande.", event.threadID);
      }
    });
  });
}

// Gestion propre de l'arrêt et des exceptions globales
process.on("SIGINT", () => {
  console.log("\n🛑 Arrêt du bot demandé par l'utilisateur...");
  process.exit(0);
});

process.on("uncaughtException", (error) => {
  console.error("💥 Exception non capturée :", error);
});

// Lancement principal
demarrerBot();

