module.exports.config = {
  name: "stop",
  aliases: ["arreter"],
  description: "Éteint le bot (admin uniquement)",
  adminSeulement: true
};

module.exports.run = async function ({ api, event }) {
  await api.sendMessage("🛑 Arrêt du bot...", event.threadID);
  process.exit(0);
};
