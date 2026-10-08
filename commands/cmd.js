const fs = require("fs");
const path = require("path");

module.exports = {
  config: {
    name: "cmd",
    aliases: ["command", "install", "reload"],
    version: "1.0.0",
    author: "YourName",
    countDown: 2,
    role: 1, // Admin seulement
    shortDescription: "Recharge ou installe dynamiquement une commande",
    longDescription: "Permet de recharger une commande ou de créer un nouveau fichier .js directement depuis Messenger sans redémarrer le serveur.",
    category: "system",
    guide: "{pn} [reload <nom> | install <nom.js> <code>]"
  },

  run: async function ({ api, event, args, config, commandes }) {
    const { threadID, messageID, messageReply } = event;
    const prefix = config.prefix || "!";

    if (!args[0]) {
      return api.sendMessage(
        `🛠️ **GESTION DYNAMIQUE DES COMMANDES**\n` +
        `────────────────────\n` +
        `📌 **Recharger :** \`${prefix}cmd reload <nom>\`\n` +
        `📌 **Installer :** Répondez au code JS avec \`${prefix}cmd install <nom.js>\``,
        threadID,
        messageID
      );
    }

    const action = args[0].toLowerCase();
    const cheminCommandes = path.join(process.cwd(), "commands");

    // 1. Rechargement à chaud d'une commande existante
    if (action === "reload") {
      const nomCmd = args[1]?.toLowerCase();
      if (!nomCmd) {
        return api.sendMessage("⚠️ Spécifiez le nom de la commande à recharger.", threadID, messageID);
      }

      const fichier = `${nomCmd}.js`;
      const cheminFichier = path.join(cheminCommandes, fichier);

      if (!fs.existsSync(cheminFichier)) {
        return api.sendMessage(`❌ Fichier \`${fichier}\` introuvable dans le dossier commands/`, threadID, messageID);
      }

      try {
        delete require.cache[require.resolve(cheminFichier)];
        const nouvelleCmd = require(cheminFichier);
        const name = nouvelleCmd.config?.name || nomCmd;

        commandes.set(name.toLowerCase(), nouvelleCmd);
        if (Array.isArray(nouvelleCmd.config?.aliases)) {
          nouvelleCmd.config.aliases.forEach((alias) => commandes.set(alias.toLowerCase(), nouvelleCmd));
        }

        return api.sendMessage(`✅ La commande **${name}** a été rechargée avec succès !`, threadID, messageID);
      } catch (err) {
        return api.sendMessage(`❌ Erreur lors du rechargement de \`${nomCmd}\` : ${err.message}`, threadID, messageID);
      }
    }

    // 2. Installation directe d'une commande via un message
    if (action === "install") {
      let nomFichier = args[1];
      let code = args.slice(2).join(" ");

      if (messageReply && messageReply.body) {
        code = messageReply.body;
      }

      if (!nomFichier) {
        return api.sendMessage("⚠️ Indiquez un nom de fichier (ex: `test.js`).", threadID, messageID);
      }

      if (!nomFichier.endsWith(".js")) {
        nomFichier += ".js";
      }

      if (!code) {
        return api.sendMessage("⚠️ Fournissez le code source ou répondez à un message contenant le code JavaScript.", threadID, messageID);
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

        return api.sendMessage(`✅ Commande \`${nomFichier}\` enregistrée et activée sous le nom **${name}** !`, threadID, messageID);
      } catch (err) {
        return api.sendMessage(`❌ Erreur lors de l'installation : ${err.message}`, threadID, messageID);
      }
    }

    return api.sendMessage(`❌ Option inconnue. Utilisez \`${prefix}cmd reload\` ou \`${prefix}cmd install\`.`, threadID, messageID);
  },

  onStart: async function (context) {
    return this.run(context);
  }
};

