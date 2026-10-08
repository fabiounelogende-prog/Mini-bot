const fs = require("fs");
const path = require("path");

module.exports = {
  config: {
    name: "cmd",
    aliases: ["command", "install", "reload"],
    description: "Recharge ou installe dynamiquement une commande à chaud",
    adminOnly: true,
    cooldown: 2
  },

  run: async function ({ args, reply, config, commandes, toUnicodeBold }) {
    const prefix = config.prefix || "!";

    if (!args[0]) {
      const infoMsg = 
        `╭━━━━━━━━━━━━━━━━╮\n` +
        `│ 🛠️  ${toUnicodeBold("GESTION DES COMMANDES")}\n` +
        `├━━━━━━━━━━━━━━━━╯\n` +
        `│ 📌 ${toUnicodeBold("Recharger :")} ${prefix}cmd reload <nom>\n` +
        `│ 📌 ${toUnicodeBold("Installer :")} Répondez au code JS avec :\n` +
        `│    ${prefix}cmd install <nom.js>\n` +
        `╰━━━━━━━━━━━━━━━━━`;
      return reply(infoMsg);
    }

    const action = args[0].toLowerCase();
    const cheminCommandes = path.join(process.cwd(), "commands");

    // 1. Rechargement à chaud
    if (action === "reload") {
      const nomCmd = args[1]?.toLowerCase();
      if (!nomCmd) {
        return reply("⚠️ Veuillez spécifier le nom de la commande à recharger.");
      }

      const fichier = `${nomCmd}.js`;
      const cheminFichier = path.join(cheminCommandes, fichier);

      if (!fs.existsSync(cheminFichier)) {
        return reply(`❌ Le fichier « ${fichier} » est introuvable dans commands/`);
      }

      try {
        delete require.cache[require.resolve(cheminFichier)];
        const nouvelleCmd = require(cheminFichier);
        const name = nouvelleCmd.config?.name || nomCmd;

        commandes.set(name.toLowerCase(), nouvelleCmd);
        if (Array.isArray(nouvelleCmd.config?.aliases)) {
          nouvelleCmd.config.aliases.forEach((alias) => commandes.set(alias.toLowerCase(), nouvelleCmd));
        }

        return reply(`✅ La commande « ${toUnicodeBold(name)} » a été rechargée avec succès !`);
      } catch (err) {
        return reply(`❌ Erreur lors du rechargement de « ${nomCmd} » : ${err.message}`);
      }
    }

    // 2. Installation directe
    if (action === "install") {
      let nomFichier = args[1];
      let code = args.slice(2).join(" ");

      if (!nomFichier) {
        return reply("⚠️ Indiquez un nom de fichier (ex: test.js).");
      }

      if (!nomFichier.endsWith(".js")) {
        nomFichier += ".js";
      }

      if (!code) {
        return reply("⚠️ Fournissez le code source ou répondez à un message contenant le code JS.");
      }

      const cheminDestination = path.join(cheminCommandes, nomFichier);

      try {
        fs.writeFileSync(cheminDestination, code, "utf8");
        delete require.cache[require.resolve(cheminDestination)];
        const nouvelleCmd = require(cheminDestination);
        const name = nouvelleCmd.config?.name || nomFichier.replace(".js", "");

        commandes.set(name.toLowerCase(), nouvelleCmd);
        if (Array.isArray(nouvelleCmd.config?.aliases)) {
          nouvelleCmd.config.aliases.forEach((alias) => commandes.set(alias.toLowerCase(), nouvelleCmd));
        }

        return reply(`✅ La commande « ${nomFichier} » est installée sous le nom ${toUnicodeBold(name)} !`);
      } catch (err) {
        return reply(`❌ Erreur lors de l'installation : ${err.message}`);
      }
    }

    return reply(`❌ Option invalide. Utilisez « ${prefix}cmd reload » ou « ${prefix}cmd install ».`);
  }
};

