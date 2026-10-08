module.exports = {
  config: {
    name: "prefix",
    aliases: ["pre", "prefixe"],
    description: "Affiche le préfixe et le nom du bot",
    adminOnly: false,
    cooldown: 2
  },

  run: async function ({ reply, config, toUnicodeBold }) {
    const prefix = config.prefix || "!";
    const botName = config.botName || "Célestin Bot";

    const msg = 
      `╭━━━━━━━━━━━━━━━━╮\n` +
      `│ 🤖  ${toUnicodeBold("PRÉFIXE DU BOT")}\n` +
      `├━━━━━━━━━━━━━━━━╯\n` +
      `│ ⚙️ ${toUnicodeBold("Nom :")} ${botName}\n` +
      `│ 📌 ${toUnicodeBold("Préfixe :")} « ${prefix} »\n` +
      `│ 💡 Tapez « ${prefix}help » pour ouvrir le menu.\n` +
      `╰━━━━━━━━━━━━━━━━━`;

    return reply(msg);
  }
};

