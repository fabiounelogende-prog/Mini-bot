const fs = require("fs");
const path = require("path");

/**
 * Charge dynamiquement toutes les commandes du dossier spécifié
 * @param {string} dossier - Chemin absolu du dossier des commandes
 * @returns {Map} Map contenant les commandes indexées par nom et alias
 */
function chargerCommandes(dossier) {
  const commandes = new Map();

  if (!fs.existsSync(dossier)) {
    console.warn(`⚠️ Le dossier des commandes n'existe pas : ${dossier}`);
    return commandes;
  }

  const fichiers = fs.readdirSync(dossier).filter((f) => f.endsWith(".js"));

  for (const fichier of fichiers) {
    try {
      const cheminFichier = path.join(dossier, fichier);

      // Invalidation du cache de require en cas de rechargement à chaud
      delete require.cache[require.resolve(cheminFichier)];

      const commande = require(cheminFichier);
      const config = commande.config || {};
      const nomCmd = config.name;

      // Prise en charge des deux syntaxes d'exécution (GoatBot/Cassidy "onStart" et standard "run")
      const execFn = commande.onStart || commande.run;

      if (!nomCmd || typeof execFn !== "function") {
        console.warn(`⚠️ Commande ignorée (structure invalide ou fonction manquante) : ${fichier}`);
        continue;
      }

      // Enregistrement par le nom principal
      commandes.set(nomCmd.toLowerCase(), commande);

      // Enregistrement des alias s'ils existent
      if (Array.isArray(config.aliases)) {
        config.aliases.forEach((alias) => {
          if (typeof alias === "string" && alias.trim()) {
            commandes.set(alias.toLowerCase().trim(), commande);
          }
        });
      }
    } catch (e) {
      console.warn(`⚠️ Impossible de charger le fichier ${fichier} :`, e.message);
    }
  }

  return commandes;
}

/**
 * Traite et exécute les messages entrants depuis Messenger
 */
async function gererMessage({ api, event, config, commandes }) {
  const body = (event.body || "").trim();
  if (!body) return;

  const prefix = config.prefix || "!";
  const admins = Array.isArray(config.admins) ? config.admins : [];
  const prefixRequis = config.prefixRequis !== false;

  const avecPrefixe = body.startsWith(prefix);
  let args = [];
  let nomCommande = "";

  if (avecPrefixe) {
    args = body.slice(prefix.length).trim().split(/\s+/);
    nomCommande = (args.shift() || "").toLowerCase();
  } else if (!prefixRequis) {
    args = body.split(/\s+/);
    nomCommande = (args.shift() || "").toLowerCase();
  } else {
    // Le préfixe est obligatoire et absent -> on ignore silencieusement
    return;
  }

  if (!nomCommande) return;

  const commande = commandes.get(nomCommande);

  if (!commande) {
    if (!avecPrefixe) return;
    return api.sendMessage(
      `❌ Commande inconnue. Tapez ${prefix}help pour consulter la liste des commandes.`,
      event.threadID,
      event.messageID
    );
  }

  const cfg = commande.config || {};

  // Vérification des privilèges Administrateur (role === 1 ou adminSeulement)
  const estAdmin = admins.includes(event.senderID);
  const roleRequis = cfg.role || 0;
  const adminSeulement = cfg.adminSeulement || roleRequis > 0;

  if (adminSeulement && !estAdmin) {
    return api.sendMessage(
      "❌ Cette commande est réservée aux administrateurs du bot.",
      event.threadID,
      event.messageID
    );
  }

  // Sélection de la méthode d'exécution (onStart ou run)
  const executer = commande.onStart || commande.run;

  try {
    await executer({ api, event, args, config, commandes });
  } catch (error) {
    console.error(`❌ Erreur d'exécution dans la commande [${nomCommande}] :`, error);
    api.sendMessage(
      `❌ Une erreur est survenue lors de l'exécution de la commande "${nomCommande}".`,
      event.threadID,
      event.messageID
    );
  }
}

module.exports = {
  chargerCommandes,
  gererMessage
};

  
