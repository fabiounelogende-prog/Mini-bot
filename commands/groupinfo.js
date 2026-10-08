module.exports = {
  config: {
    name: "groupinfo",
    aliases: ["infogroupe", "gc", "ginfo"],
    description: "Affiche les statistiques de la conversation",
    adminOnly: false,
    cooldown: 3
  },

  run: async function ({ api, event, reply, toUnicodeBold }) {
    try {
      const info = await api.getThreadInfo(event.threadID);

      const nomGroupe = info.threadName || "Sans nom";
      const totalMembres = info.participantIDs ? info.participantIDs.length : 0;
      const totalAdmins = info.adminIDs ? info.adminIDs.length : 0;
      const totalMsgs = info.messageCount || "N/A";

      const msg = 
        `╭━━━━━━━━━━━━━━━━╮\n` +
        `│ 👥  ${toUnicodeBold("INFOS DU GROUPE")}\n` +
        `├━━━━━━━━━━━━━━━━╯\n` +
        `│ 🏷️ ${toUnicodeBold("Nom :")} ${nomGroupe}\n` +
        `│ 🆔 ${toUnicodeBold("ID :")} ${event.threadID}\n` +
        `│ 👤 ${toUnicodeBold("Membres :")} ${totalMembres}\n` +
        `│ 👑 ${toUnicodeBold("Admins :")} ${totalAdmins}\n` +
        `│ 💬 ${toUnicodeBold("Messages :")} ${totalMsgs}\n` +
        `│ 🎨 ${toUnicodeBold("Émoji :")} ${info.emoji || "👍"}\n` +
        `╰━━━━━━━━━━━━━━━━━`;

      return reply(msg);
    } catch (error) {
      console.error("Erreur dans groupinfo :", error);
      return reply("❌ Impossible de récupérer les informations de ce groupe.");
    }
  }
};

