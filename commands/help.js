module.exports = {
  config: {
    name: "help",
    aliases: ["aide", "commands", "menu"],
    version: "1.0.0",
    author: "YourName",
    countDown: 2,
    role: 0,
    shortDescription: "Affiche la liste complète des commandes",
    longDescription: "Affiche toutes les commandes chargées dans le système ou les détails d'une commande spécifique.",
    category: "system",
    guide: "{pn} [nom de la commande]"
  },

  run: async function ({ api, event, config, commandes, args }) {
    const prefix = config.prefix || "!";

    // 1. Si un nom de commande spécifique est passé en argument (ex: !help massadd)
    if (args && args.length > 0) {
      const nomRecherche = args[0].toLowerCase();
      const cmd = commandes.get(nomRecherche);

      if (!cmd) {
        return api.sendMessage(
          `❌ La commande "${nomRecherche}" est introuvable. Tapez \`${prefix}help\` pour voir toutes les commandes.`,
          event.threadID,
          event.messageID
        );
      }

      const cfg = cmd.config || {};
      let detail = `📖 **FICHE COMMANDE : ${cfg.name?.toUpperCase() || nomRecherche}**\n`;
      detail += `────────────────────\n`;
      detail += `📝 **Description :** ${cfg.longDescription || cfg.shortDescription || cfg.description || "Aucune description"}\n`;
      detail += `🏷️ **Alias :** ${Array.isArray(cfg.aliases) && cfg.aliases.length > 0 ? cfg.aliases.join(", ") : "Aucun"}\n`;
      detail += `🔒 **Permission :** ${cfg.role === 1 || cfg.adminSeulement ? "Admin uniquement 🔴" : "Tous les membres 🟢"}\n`;
      detail += `💡 **Usage :** ${cfg.guide ? cfg.guide.replace(/{pn}/g, prefix + cfg.name) : prefix + cfg.name}\n`;

      return api.sendMessage(detail, event.threadID, event.messageID);
    }

    // 2. Affichage de la liste globale des commandes
    const commandesUniques = new Map();
    commandes.forEach((cmd) => {
      if (cmd.config && cmd.config.name) {
        commandesUniques.set(cmd.config.name.toLowerCase(), cmd);
      }
    });

    let message = `💫 **${config.botName || "Bot"} — MENU DES COMMANDES** 💫\n`;
    message += `────────────────────\n`;

    commandesUniques.forEach((cmd) => {
      const cfg = cmd.config || {};
      const desc = cfg.shortDescription || cfg.description || "Pas de description";
      message += `• **${prefix}${cfg.name}** : ${desc}\n`;
    });

    message += `────────────────────\n`;
    message += `💡 *Astuce :* Tapez \`${prefix}help <commande>\` pour obtenir des explications détaillées sur une commande.`;

    return api.sendMessage(message, event.threadID, event.messageID);
  },

  // Compatibilité avec la syntaxe GoatBot / Cassidy
  onStart: async function (context) {
    return this.run(contex
t);
  }
};
