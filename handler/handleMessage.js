const fs = require("fs");
const path = require("path");

// Map pour gérer les temps d'attente (cooldowns)
const cooldowns = new Map();

/**
 * Convertit du texte standard en police Unicode Sans-Serif Grasse (Aesthetic Bold)
 */
function toUnicodeBold(str = "") {
  const normal = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bold   = "𝖺𝖻𝖼𝖽𝖾𝖿𝗀𝗁𝗂沉𝗄𝗅𝗆𝗇𝗈𝗉𝗊𝗋𝗌𝗍𝗎𝗏𝗐𝗑𝗒𝗓𝖠𝖡𝖢𝖣𝖤𝖥𝖭𝖧𝖨𝖩𝖪𝖫𝖬𝖭𝖮𝖯𝖰𝖱𝖲𝖳𝖴𝖵𝖶𝖷𝖸𝖹𝟢𝟣𝟤𝟥𝟦𝟧𝟨𝟩𝟪𝟫";
  
  // Mapping direct pour un style élégant et lisible sur tous les téléphones
  return str.split("").map((char) => {
    const index = normal.indexOf(char);
    return index !== -1 ? bold[index] || char : char;
  }).join("");
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
        console.warn(`⚠️  [CÉLESTIN] Commande ignorée (manque config.name ou run) : ${fichier}`);
        continue;
      }

      commandes.set(nomCmd.toLowerCase(), commande);

      if (Array.isArray(config.aliases)) {
        config.aliases.forEach((alias) => {
          if (alias) commandes.set(alias.toLowerCase().trim(), commande);
        });
      }
    } catch (e) {
      console.error(`❌ [CÉLESTIN] Erreur lors du chargement de ${fichier} :`, e.message);
    }
  }

  return commandes;
}

/**
 * Traite les messages entrants et exécute les commandes avec un design soigné
 */
async function gererMessage({ api, event, config, commandes }) {
  const body = (event.body || "").trim();
  if (!body) return;

  const prefix = config.prefix || "!";
  const admins = Array.isArray(config.admins) ? config.admins : [];

  // Détection du préfixe
  if (!body.startsWith(prefix)) return;

  const args = body.slice(prefix.length).trim().split(/\s+/);
  const nomCommande = (args.shift() || "").toLowerCase();

  if (!nomCommande) return;

  // Raccourci natif "reply" avec mise en page automatique
  const reply = (messageText) => {
    return api.sendMessage(messageText, event.threadID, event.messageID);
  };

  const commande = commandes.get(nomCommande);
  if (!commande) {
    const unknownMsg = 
      `╭━━━━━━━━━━━━━━━━╮\n` +
      `│ ⚠️  ${toUnicodeBold("COMMANDE INTROUVABLE")}\n` +
      `├━━━━━━━━━━━━━━━━╯\n` +
      `│ ❌ La commande « ${nomCommande} » n'existe pas.\n` +
      `│ 💡 Tapez « ${prefix}help » pour consulter le menu.\n` +
      `╰━━━━━━━━━━━━━━━━━`;
    return reply(unknownMsg);
  }

  const cfg = commande.config || {};

  // 1. Vérification Administrateur
  const estAdmin = admins.includes(event.senderID);
  if (cfg.adminOnly && !estAdmin) {
    const adminMsg = 
      `╭━━━━━━━━━━━━━━━━╮\n` +
      `│ ⛔  ${toUnicodeBold("ACCÈS RESTREINT")}\n` +
      `├━━━━━━━━━━━━━━━━╯\n` +
      `│Cette commande est réservée aux administrateurs du bot.\n` +
      `╰━━━━━━━━━━━━━━━━━`;
    return reply(adminMsg);
  }

  // 2. Gestion du Cooldown (anti-spam) avec typographie stylisée
  const cooldownSec = cfg.cooldown || 2;
  const keyCooldown = `${event.senderID}_${cfg.name || nomCommande}`;
  const now = Date.now();

  if (cooldowns.has(keyCooldown)) {
    const expirationTime = cooldowns.get(keyCooldown) + cooldownSec * 1000;
    if (now < expirationTime) {
      const timeLeft = ((expirationTime - now) / 1000).toFixed(1);
      const cooldownMsg = 
        `⏳ ${toUnicodeBold("PATIENCE")} : Veuillez attendre ${timeLeft}s avant de réutiliser « ${prefix}${nomCommande} ».`;
      return reply(cooldownMsg);
    }
  }

  cooldowns.set(keyCooldown, now);
  setTimeout(() => cooldowns.delete(keyCooldown), cooldownSec * 1000);

  // 3. Exécution sécurisée de la commande
  try {
    await commande.run({ api, event, args, reply, config, commandes, toUnicodeBold });
  } catch (error) {
    console.error(`💥 Erreur d'exécution [${nomCommande}] :`, error);
    const errorMsg = 
      `╭━━━━━━━━━━━━━━━━╮\n` +
      `│ 💥  ${toUnicodeBold("ERREUR SYSTÈME")}\n` +
      `├━━━━━━━━━━━━━━━━╯\n` +
      `│ Une erreur est survenue lors de l'exécution de « ${nomCommande} ».\n` +
      `╰━━━━━━━━━━━━━━━━━`;
    reply(errorMsg);
  }
}

module.exports = {
  chargerCommandes,
  gererMessage,
  toUnicodeBold
};

