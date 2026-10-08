const fs = require("fs");
const path = require("path");

function chargerCommandes(dossier) {
  const commandes = new Map();
  if (!fs.existsSync(dossier)) return commandes;

  const fichiers = fs.readdirSync(dossier).filter(f => f.endsWith(".js"));
  for (const fichier of fichiers) {
    try {
      const commande = require(path.join(dossier, fichier));
      if (!commande.config || !commande.config.name || typeof commande.run !== "function") {
        console.warn(`⚠️ Commande ignorée (format invalide) : ${fichier}`);
        continue;
      }
      commandes.set(commande.config.name.toLowerCase(), commande);
      (commande.config.aliases || []).forEach(a => commandes.set(a.toLowerCase(), commande));
    } catch (e) {
      console.warn(`⚠️ Impossible de charger ${fichier} :`, e.message);
    }
  }
  return commandes;
}

async function gererMessage({ api, event, config, commandes }) {
  const body = (event.body || "").trim();
  if (!body) return;

  const { prefix, admins } = config;
  // prefixRequis: false → les commandes marchent aussi sans "!" (utile en PV).
  // Par défaut (non défini ou true) → le préfixe reste obligatoire.
  const prefixRequis = config.prefixRequis !== false;

  const avecPrefixe = body.startsWith(prefix);
  let args, nomCommande;

  if (avecPrefixe) {
    args = body.slice(prefix.length).trim().split(/\s+/);
    nomCommande = (args.shift() || "").toLowerCase();
  } else if (!prefixRequis) {
    args = body.split(/\s+/);
    nomCommande = (args.shift() || "").toLowerCase();
  } else {
    return; // préfixe obligatoire et absent → on ignore le message
  }

  if (!nomCommande) return;
  const commande = commandes.get(nomCommande);

  if (!commande) {
    // Sans préfixe, un message qui ne correspond à aucune commande n'est
    // pas forcément destiné au bot (conversation normale) → on reste silencieux.
    if (!avecPrefixe) return;
    return api.sendMessage(`❌ Commande inconnue. Tape ${prefix}help pour voir la liste.`, event.threadID);
  }

  if (commande.config.adminSeulement && !admins.includes(event.senderID)) {
    return api.sendMessage("❌ Cette commande est réservée aux admins.", event.threadID);
  }

  await commande.run({ api, event, args, config, commandes });
}

module.exports = { chargerCommandes, gererMessage };
