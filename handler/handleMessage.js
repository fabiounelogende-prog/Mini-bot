const fs = require("fs");
const path = require("path");

// Map pour gérer les temps d'attente (cooldowns)
const cooldowns = new Map();

/**
 * Convertit du texte standard en police Unicode Sans-Serif Grasse.
 * Table corrigée (l'ancienne version cassait "j" en caractère chinois
 * et "G" en doublon de "N") — gardée disponible pour les commandes qui
 * en ont besoin, mais plus utilisée dans les messages système ci-dessous
 * (texte simple = plus lisible, plus fiable sur tous les téléphones).
 */
function toUnicodeBold(str = "") {
  const normal = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  // Important : ces lettres stylisées sont des caractères "astraux"
  // (hors du plan de base Unicode) — en JS, une simple chaîne les découpe
  // en deux unités UTF-16 et casse tout. Array.from() respecte les vrais
  // caractères, donc chaque élément du tableau est entier.
  const bold = Array.from(
    "𝖺𝖻𝖼𝖽𝖾𝖿𝗀𝗁𝗂𝗃𝗄𝗅𝗆𝗇𝗈𝗉𝗊𝗋𝗌𝗍𝗎𝗏𝗐𝗑𝗒𝗓" +
    "𝖠𝖡𝖢𝖣𝖤𝖥𝖦𝖧𝖨𝖩𝖪𝖫𝖬𝖭𝖮𝖯𝖰𝖱𝖲𝖳𝖴𝖵𝖶𝖷𝖸𝖹" +
    "𝟢𝟣𝟤𝟥𝟦𝟧𝟨𝟩𝟪𝟫"
  );

  return Array.from(str)
    .map((char) => {
      const index = normal.indexOf(char);
      return index !== -1 ? bold[index] || char : char;
    })
    .join("");
}

/**
 * Charge dynamiquement toutes les commandes natives du dossier commands/
 */
function chargerCommandes(dossier) {
  const commandes = new Map();

  if (!fs.existsSync(dossier)) {
    fs.mkdirSync(dossier, { recursive: true });
    return commandes;
  }

  const fichiers = fs.readdirSync(dossier).filter((f) => f.endsWith(".js"));

  for (const fichier of fichiers) {
    try {
      const cheminFichier = path.join(dossier, fichier);
      delete require.cache[require.resolve(cheminFichier)];

      const commande = require(cheminFichier);
      const config = commande.config || {};
      const nomCmd = config.name;

      if (!nomCmd || typeof commande.run !== "function") {
        console.warn(`⚠️  Commande ignorée (manque config.name ou run) : ${fichier}`);
        continue;
      }

      commandes.set(nomCmd.toLowerCase(), commande);

      if (Array.isArray(config.aliases)) {
        config.aliases.forEach((alias) => {
          if (alias) commandes.set(alias.toLowerCase().trim(), commande);
        });
      }
    } catch (e) {
      console.error(`❌ Erreur lors du chargement de ${fichier} :`, e.message);
    }
  }

  return commandes;
}

// Plusieurs variantes pour chaque situation : les réponses du bot varient
// un peu à chaque fois au lieu de répéter toujours le même message.
const MESSAGES_PREFIXE_SEUL = [
  (prefix) => `Hey 👋 tu viens de taper le préfixe seul (« ${prefix} ») — mais tu veux faire quoi exactement ? 🤔\nTape « ${prefix}help » pour voir toutes les commandes.`,
  (prefix) => `💫 Oui ? Il manque juste le nom de la commande après « ${prefix} ».\nEssaie « ${prefix}help » pour la liste complète.`,
  (prefix) => `🙂 Je t'écoute, mais « ${prefix} » seul ne veut rien dire pour moi.\nTape « ${prefix}help » et je te montre tout ce que je sais faire.`
];

const MESSAGES_COMMANDE_INCONNUE = [
  (prefix, nom) => `❌ La commande « ${nom} » n'existe pas.\n💡 Tape « ${prefix}help » pour voir le menu.`,
  (prefix, nom) => `🤷 Je ne connais pas « ${nom} ».\nEssaie « ${prefix}help » pour la liste des commandes disponibles.`
];

function messageAuHasard(liste, ...args) {
  const fn = liste[Math.floor(Math.random() * liste.length)];
  return fn(...args);
}

/**
 * Traite les messages entrants et exécute les commandes.
 */
async function gererMessage({ api, event, config, commandes }) {
  const body = (event.body || "").trim();
  if (!body) return;

  const prefix = config.prefix || "!";
  const admins = Array.isArray(config.admins) ? config.admins : [];

  const reply = (messageText) => {
    return api.sendMessage(messageText, event.threadID, event.messageID);
  };

  if (!body.startsWith(prefix)) return;

  // Cas spécial : la personne a tapé le préfixe tout seul (ex: juste "!")
  if (body === prefix) {
    return reply(messageAuHasard(MESSAGES_PREFIXE_SEUL, prefix));
  }

  const args = body.slice(prefix.length).trim().split(/\s+/);
  const nomCommande = (args.shift() || "").toLowerCase();

  // Le préfixe était suivi uniquement d'espaces → même traitement que préfixe seul
  if (!nomCommande) {
    return reply(messageAuHasard(MESSAGES_PREFIXE_SEUL, prefix));
  }

  const commande = commandes.get(nomCommande);
  if (!commande) {
    return reply(messageAuHasard(MESSAGES_COMMANDE_INCONNUE, prefix, nomCommande));
  }

  const cfg = commande.config || {};

  // 1. Vérification Administrateur
  const estAdmin = admins.includes(event.senderID);
  if (cfg.adminOnly && !estAdmin) {
    return reply("⛔ Cette commande est réservée aux administrateurs du bot.");
  }

  // 2. Gestion du cooldown (anti-spam)
  const cooldownSec = cfg.cooldown || 2;
  const keyCooldown = `${event.senderID}_${cfg.name || nomCommande}`;
  const now = Date.now();

  if (cooldowns.has(keyCooldown)) {
    const expirationTime = cooldowns.get(keyCooldown) + cooldownSec * 1000;
    if (now < expirationTime) {
      const timeLeft = ((expirationTime - now) / 1000).toFixed(1);
      return reply(`⏳ Patiente ${timeLeft}s avant de réutiliser « ${prefix}${nomCommande} ».`);
    }
  }

  cooldowns.set(keyCooldown, now);
  setTimeout(() => cooldowns.delete(keyCooldown), cooldownSec * 1000);

  // 3. Exécution sécurisée de la commande
  try {
    await commande.run({ api, event, args, reply, config, commandes, toUnicodeBold });
  } catch (error) {
    console.error(`💥 Erreur d'exécution [${nomCommande}] :`, error);
    reply(`💥 Une erreur est survenue lors de l'exécution de « ${nomCommande} ».\n(détail enregistré dans la console du bot)`);
  }
}

module.exports = {
  chargerCommandes,
  gererMessage,
  toUnicodeBold
};
