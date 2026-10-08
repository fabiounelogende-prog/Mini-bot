module.exports.config = {
  name: "help",
  aliases: ["aide", "commands"],
  description: "Affiche la liste des commandes",
  adminSeulement: false
};

module.exports.run = async function ({ api, event, config, commandes }) {
  const uniques = new Set();
  commandes.forEach(c => uniques.add(c.config.name));

  let texte = `💫 ${config.botName} — Commandes disponibles 💫\n`;
  texte += `────────────────────\n`;
  [...uniques].sort().forEach(nom => {
    const c = commandes.get(nom);
    texte += `• ${config.prefix}${nom} — ${c.config.description || "Pas de description"}\n`;
  });

  return api.sendMessage(texte, event.threadID);
};
