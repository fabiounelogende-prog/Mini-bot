module.exports = {
  config: {
    name: "help",
    aliases: ["aide", "commands", "menu"],
    version: "1.0.0",
    author: "YourName",
    countDown: 3,
    role: 0,
    shortDescription: "Affiche la liste des commandes disponibles",
    longDescription: "Affiche toutes les commandes enregistrées sur le bot avec leurs descriptions.",
    category: "system",
    guide: "{pn} [nom de la commande]"
  },

  run: async function ({ api, event, config, commandes, args }) {
    const prefix = config.prefix || "!";

    // Si l'utilisateur demande l'aide d'une commande spécifique
    if (args && args[0]) {
      const nomRecherche = args[0].toLowerCase();
      const cmd = commandes.get(nomRecherche);

      if (!cmd) {
        return api.sendMessage(`❌ La commande "${nomRecherche}" n'existe pas.`, event.threadID, event.messageID);
      }

      const cfg = cmd.config || {};
      let detail = `📖 **COMMANDE : ${cfg.name?.toUpperCase()}**\n`;
      detail += `────────────────────\n`;
      detail += `📝 **Description :** ${cfg.longDescription || cfg.shortDescription || cfg.description || "Aucune description"}\n`;
      detail += `🏷️ **Alias :** ${Array.isArray(cfg.aliases) && cfg.aliases.length > 0 ? cfg.aliases.join(", ") : "Aucun"}\n`;
      detail += `🔒 **Rôle :** ${cfg.role === 1 || cfg.adminSeulement ? "Admin uniquement 🔴" : "Tous les membres 🟢"}\n`;
      detail += `💡 **Utilisation :** ${cfg.guide ? cfg.guide.replace(/{pn}/g, prefix + cfg.name) : prefix + cfg.name}\n`;

      return api.sendMessage(detail, event.threadID, event.messageID);
    }

    // Liste globale des commandes uniques
    const commandesUniques = new Map();
    commandes.forEach((cmd, key) => {
      if (cmd.config && cmd.config.name) {
        commandesUniques.set(cmd.config.name.toLowerCase(), cmd);
      }
    });

    let texte = `💫 **${config.botName || "Bot"} — LISTE DES COMMANDES** 💫\n`;
    texte += `────────────────────\n`;

    commandesUniques.forEach((cmd) => {
      const cfg = cmd.config;
      const desc = cfg.shortDescription || cfg.description || "Pas de description";
      texte += `• **${prefix}${cfg.name}** : ${desc}\n`;
    });

    texte += `────────────────────\n`;
    texte += `💡 Tape \`${prefix}help <commande>\` pour plus de détails sur une commande.`;

    return api.sendMessage(texte, event.threadID, event.messageID);
  },

  // Alias pour la compatibilité avec GoatBot
  onStart: async function (context) {
    return this.run(contex
                      t);
  }
};
