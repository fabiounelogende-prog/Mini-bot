const os = require("os");

module.exports = {
  config: {
    name: "uptime",
    aliases: ["upt", "up", "status"],
    version: "1.0.0",
    author: "YourName",
    countDown: 2,
    role: 0, // Accessible à tous
    shortDescription: "Affiche le temps de fonctionnement du bot",
    longDescription: "Affiche la durée d'activité ininterrompue du bot, la consommation de la mémoire RAM et les informations sur l'hébergement.",
    category: "system",
    guide: "{pn}"
  },

  run: async function ({ api, event, config }) {
    const uptimeSeconds = process.uptime();
    const days = Math.floor(uptimeSeconds / (3600 * 24));
    const hours = Math.floor((uptimeSeconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = Math.floor(uptimeSeconds % 60);

    const uptimeFormatted = `${days > 0 ? `${days}j ` : ""}${hours}h ${minutes}m ${seconds}s`;
    const memoryUsed = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
    const totalMemory = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);

    const message =
      `⏰ **STATUT & UPTIME DU BOT**\n` +
      `────────────────────\n` +
      `🤖 **Bot :** ${config.botName || "Bot"}\n` +
      `⏳ **En ligne depuis :** ${uptimeFormatted}\n` +
      `💾 **Utilisation RAM :** ${memoryUsed} MB / ${totalMemory} GB\n` +
      `💻 **Système :** ${os.platform()} (${os.arch()})\n` +
      `🟢 **Node.js :** ${process.version}\n` +
      `────────────────────`;

    return api.sendMessage(message, event.threadID, event.messageID);
  },

  // Compatibilité GoatBot / Cassidy
  onStart: async function (context) {
    return this.run(context);
 
    }
};
