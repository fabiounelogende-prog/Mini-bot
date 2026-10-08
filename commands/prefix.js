module.exports = {
  config: {
    name: "prefix",
    aliases: ["pre", "prefixe"],
    version: "1.0.0",
    author: "YourName",
    countDown: 2,
    role: 0, // Accessible à tous
    shortDescription: "Affiche le préfixe actuel du bot",
    longDescription: "Affiche le préfixe système configuré pour interagir avec le bot ainsi que le nom du bot.",
    category: "system",
    guide: "{pn}"
  },

  run: async function ({ api, event, config }) {
    const prefix = config.prefix || "!";
    const botName = config.botName || "Bot";

    const message = 
      `🤖 **INFORMATIONS PRÉFIXE**\n` +
      `────────────────────\n` +
      `⚙️ **Nom du Bot :** ${botName}\n` +
      `📌 **Préfixe actuel :** \`${prefix}\` \n` +
      `💡 **Utilisation :** Tapez \`${prefix}help\` pour consulter la liste complète des commandes.`;

    return api.sendMessage(message, event.threadID, event.messageID);
  },

  // Compatibilité avec la syntaxe GoatBot / Cassidy
  onStart: async function (context) {
    return this.run(context);
  }

};
