const fs = require("fs");
const path = require("path");
const login = require("fca-unofficial");

const config = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
const { chargerCommandes, gererMessage } = require("./handler/handleMessage.js");

// Système de compte : chaque fichier dans accounts/<nom>.json est un profil
// (cookies) distinct. On choisit lequel charger via config.compteActif.
const nomCompte = config.compteActif || "principal";
const cheminAppstate = path.join(__dirname, "accounts", `${nomCompte}.json`);

if (!fs.existsSync(cheminAppstate)) {
  console.error(`❌ Compte "${nomCompte}" introuvable (accounts/${nomCompte}.json).`);
  console.error("   Connecte-toi une première fois avec tes cookies Facebook");
  console.error(`   et enregistre-les dans accounts/${nomCompte}.json`);
  process.exit(1);
}

console.log(`👤 Compte actif : ${nomCompte}`);

const appstate = JSON.parse(fs.readFileSync(cheminAppstate, "utf8"));
const commandes = chargerCommandes(path.join(__dirname, "commands"));

console.log(`📦 ${commandes.size} commande(s) chargée(s).`);

login({ appState: appstate }, (err, api) => {
  if (err) {
    console.error("❌ Erreur de connexion :", err);
    return;
  }

  // Permissions minimales : pas de lecture de statut en ligne, pas de "vu"
  api.setOptions({
    listenEvents: true,
    selfListen: false,
    updatePresence: false,
    online: false
  });

  console.log(`✅ ${config.botName} est connecté et écoute les messages privés.`);

  api.listenMqtt((err, event) => {
    if (err) {
      console.error("⚠️ Erreur d'écoute :", err);
      return;
    }

    if (event.type !== "message" && event.type !== "message_reply") return;

    // Ne répond qu'en message privé (1-to-1), jamais dans les groupes
    const estPrive = event.threadID === event.senderID;
    if (config.repondreSeulementEnPv && !estPrive) return;

    gererMessage({ api, event, config, commandes }).catch(e => {
      console.error("❌ Erreur sur une commande :", e);
      api.sendMessage("❌ Une erreur est survenue.", event.threadID);
    });
  });
});
