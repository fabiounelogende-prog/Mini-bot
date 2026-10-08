const fs = require("fs");
const path = require("path");

module.exports = {
  config: {
    name: "admin",
    aliases: ["admins", "owner"],
    version: "1.0.0",
    author: "YourName",
    countDown: 2,
    role: 1, // Réservé aux administrateurs du bot
    shortDescription: "Gère la liste des administrateurs du bot",
    longDescription: "Permet d'ajouter, de supprimer ou d'afficher la liste des UIDs enregistrés comme administrateurs dans config.json.",
    category: "system",
    guide: "{pn} [add | remove | list] [UID / Mention / Réponse]"
  },

  run: async function ({ api, event, args, config }) {
    const { threadID, messageID, mentions, messageReply } = event;
    const prefix = config.prefix || "!";

    if (!args[0] || args[0].toLowerCase() === "list") {
      const adminList = Array.isArray(config.admins) ? config.admins : [];
      let msg = `👑 **LISTE DES ADMINISTRATEURS**\n────────────────────\n`;
      if (adminList.length === 0) {
        msg += `Aucun administrateur enregistré dans config.json.`;
      } else {
        adminList.forEach((id, index) => {
          msg += `${index + 1}. \`${id}\`\n`;
        });
      }
      return api.sendMessage(msg, threadID, messageID);
    }

    const action = args[0].toLowerCase();
    let targetID = args[1];

    if (messageReply) {
      targetID = messageReply.senderID;
    } else if (mentions && Object.keys(mentions).length > 0) {
      targetID = Object.keys(mentions)[0];
    }

    if (!targetID && (action === "add" || action === "remove" || action === "del")) {
      return api.sendMessage(
        `⚠️ Veuillez spécifier un UID, mentionner un membre ou répondre à un message.\nExemple : \`${prefix}admin add 61591895887142\``,
        threadID,
        messageID
      );
    }

    if (!Array.isArray(config.admins)) {
      config.admins = [];
    }

    if (action === "add") {
      if (config.admins.includes(targetID)) {
        return api.sendMessage(`⚠️ L'utilisateur \`${targetID}\` est déjà administrateur.`, threadID, messageID);
      }

      config.admins.push(targetID);
      sauvegarderConfig(config);
      return api.sendMessage(`✅ L'utilisateur \`${targetID}\` a été ajouté comme administrateur du bot.`, threadID, messageID);
    }

    if (action === "remove" || action === "del") {
      if (!config.admins.includes(targetID)) {
        return api.sendMessage(`⚠️ L'utilisateur \`${targetID}\` ne fait pas partie des administrateurs.`, threadID, messageID);
      }

      config.admins = config.admins.filter((id) => id !== targetID);
      sauvegarderConfig(config);
      return api.sendMessage(`✅ L'utilisateur \`${targetID}\` a été retiré des administrateurs.`, threadID, messageID);
    }

    return api.sendMessage(`❌ Sous-commande invalide. Utilisez : \`${prefix}admin list\`, \`${prefix}admin add <UID>\` ou \`${prefix}admin remove <UID>\`.`, threadID, messageID);
  },

  onStart: async function (context) {
    return this.run(context);
  }
};

function sauvegarderConfig(config) {
  try {
    const cheminConfig = path.join(process.cwd(), "config.json");
    fs.writeFileSync(cheminConfig, JSON.stringify(config, null, 2), "utf8");
  } catch (err) {
    console.error("❌ Impossible de mettre à jour config.json :"
, err);
  }
}
