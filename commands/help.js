module.exports = {
  config: {
    name: "help",
    aliases: ["aide", "menu"],
    description: "Affiche le menu général ou les détails d'une commande",
    adminOnly: false,
    cooldown: 2
  },

  run: async function ({ reply, config, commandes, args, toUnicodeBold }) {
    const prefix = config.prefix || "!";

    // 1. Détails d'une commande spécifique
    if (args.length > 0) {
      const nom = args[0].toLowerCase();
      const cmd = commandes.get(nom);

      if (!cmd) {
        return reply(`❌ La commande « ${nom} » n'existe pas. Tapez « ${prefix}help » pour la liste.`);
      }

      const cfg = cmd.config || {};
      const detailMsg = 
        `╭━━━━━━━━━━━━━━━━╮\n` +
        `│ 📖  ${toUnicodeBold((cfg.name || nom).toUpperCase())}\n` +
        `├━━━━━━━━━━━━━━━━╯\n` +
        `│ 📝 ${toUnicodeBold("Description :")} ${cfg.description || "Aucune description"}\n` +
        `│ 🏷️ ${toUnicodeBold("Alias :")} ${Array.isArray(cfg.aliases) && cfg.aliases.length > 0 ? cfg.aliases.join(", ") : "Aucun"}\n` +
        `│ 🔒 ${toUnicodeBold("Accès :")} ${cfg.adminOnly ? "Administrateurs 🔴" : "Membres 🟢"}\n` +
        `│ ⏳ ${toUnicodeBold("Cooldown :")} ${cfg.cooldown || 2}s\n` +
        `╰━━━━━━━━━━━━━━━━━`;

      return reply(detailMsg);
    }

    // 2. Liste générale
    const uniques = new Map();
    commandes.forEach((cmd) => {
      if (cmd.config && cmd.config.name) {
        uniques.set(cmd.config.name.toLowerCase(), cmd);
      }
    });

    let menu = 
      `╭━━━━━━━━━━━━━━━━╮\n` +
      `│ 💫  ${toUnicodeBold(config.botName || "CÉLESTIN BOT")}\n` +
      `├━━━━━━━━━━━━━━━━╯\n`;

    uniques.forEach((cmd) => {
      const cfg = cmd.config || {};
      const badge = cfg.adminOnly ? "🔒" : "🟢";
      menu += `│ ${badge} ${toUnicodeBold(prefix + cfg.name)} — ${cfg.description || "Pas de description"}\n`;
    });

    menu += 
      `├━━━━━━━━━━━━━━━━\n` +
      `│ 💡 Tapez « ${prefix}help <commande> » pour les détails.\n` +
      `╰━━━━━━━━━━━━━━━━━`;

    return reply(menu);
  }
};

