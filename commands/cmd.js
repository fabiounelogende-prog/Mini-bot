const fs = require("fs");
const path = require("path");
const { createCanvas } = require("canvas");

module.exports = {
  config: {
    name: "cmd",
    aliases: ["command", "install", "reload"],
    version: "3.0.0",
    author: "YourName",
    countDown: 2,
    role: 2, // 2 = admin du bot (lu par le handler)
    description: "Recharge ou installe une commande à chaud",
    category: "system",
    guide: "{pn} reload <nom> | {pn} install <nom.js> (en répondant au code JS)"
  },

  onStart: async function ({ api, event, args, message, config, commandes, threadsData, usersData }) {
    const prefix = config.prefix || "!";
    const action = (args[0] || "").toLowerCase();
    const envoyer = (carte, texte) => envoyerCarte(message, carte, texte);
    const contexteLoad = { api, threadsData, usersData, commandes, global };

    // ---------- AIDE ----------
    if (!action) {
      return envoyer(
        {
          statut: "info",
          titre: "GESTION DES COMMANDES",
          sousTitre: "Rechargement et installation à chaud",
          lignes: [
            { label: "Recharger", valeur: `${prefix}cmd reload <nom>` },
            { label: "Installer", valeur: `${prefix}cmd install <nom.js>` },
            { label: "Astuce", valeur: "Répondez au code JS avec la commande install" }
          ]
        },
        `🛠️ GESTION DES COMMANDES\n📌 ${prefix}cmd reload <nom>\n📌 ${prefix}cmd install <nom.js> (en répondant au code JS)`
      );
    }

    // ---------- RELOAD ----------
    if (action === "reload" || action === "load") {
      const nomCmd = (args[1] || "").toLowerCase().replace(/\.js$/, "");
      if (!nomCmd || !/^[\w-]+$/.test(nomCmd)) {
        return envoyer(
          erreur("NOM INVALIDE", "Spécifiez le nom de la commande à recharger.", [
            { label: "Exemple", valeur: `${prefix}cmd reload admin` }
          ]),
          "⚠️ Spécifiez un nom de commande valide."
        );
      }

      // Accepte le nom du fichier OU le nom/alias de la commande
      let fichier = `${nomCmd}.js`;
      let chemin = path.join(__dirname, fichier);
      if (!fs.existsSync(chemin)) {
        const trouvee = commandes.get(nomCmd);
        const nomReel = trouvee && trouvee.config && trouvee.config.name;
        if (nomReel && fs.existsSync(path.join(__dirname, `${nomReel}.js`))) {
          fichier = `${nomReel}.js`;
          chemin = path.join(__dirname, fichier);
        }
      }

      if (!fs.existsSync(chemin)) {
        return envoyer(
          erreur("FICHIER INTROUVABLE", `« ${fichier} » n'existe pas dans commands/`),
          `❌ Fichier « ${fichier} » introuvable dans commands/`
        );
      }

      try {
        const { cmd, name, aliases } = await chargerCommande(chemin, commandes, contexteLoad);
        return envoyer(
          {
            statut: "ok",
            titre: "COMMANDE RECHARGÉE",
            sousTitre: "Mise à jour effectuée avec succès",
            lignes: [
              { label: "Commande", valeur: name },
              { label: "Fichier", valeur: fichier },
              { label: "Version", valeur: cmd.config.version || "—" },
              { label: "Alias", valeur: aliases.length ? aliases.join(", ") : "Aucun" }
            ]
          },
          `✅ La commande « ${name} » a été rechargée !`
        );
      } catch (err) {
        return envoyer(
          erreur("ÉCHEC DU RECHARGEMENT", err.message, [{ label: "Fichier", valeur: fichier }]),
          `❌ Erreur lors du rechargement de « ${nomCmd} » : ${err.message}`
        );
      }
    }

    // ---------- INSTALL ----------
    if (action === "install") {
      let nomFichier = args[1] ? path.basename(args[1]) : "";
      if (!nomFichier) {
        return envoyer(
          erreur("NOM MANQUANT", "Indiquez un nom de fichier.", [
            { label: "Exemple", valeur: `${prefix}cmd install test.js` }
          ]),
          "⚠️ Indiquez un nom de fichier (ex: test.js)."
        );
      }
      if (!nomFichier.endsWith(".js")) nomFichier += ".js";
      if (!/^[\w.-]+\.js$/.test(nomFichier)) {
        return envoyer(
          erreur("NOM INVALIDE", "Caractères autorisés : lettres, chiffres, _ - ."),
          "❌ Nom de fichier invalide."
        );
      }

      let code = event.messageReply && event.messageReply.body
        ? event.messageReply.body
        : args.slice(2).join(" ");
      code = (code || "")
        .replace(/^\s*```(?:js|javascript)?\s*/i, "")
        .replace(/\s*```\s*$/, "")
        .trim();

      if (!code) {
        return envoyer(
          erreur("CODE MANQUANT", "Répondez à un message contenant le code JS.", [
            { label: "Usage", valeur: `${prefix}cmd install ${nomFichier}` }
          ]),
          "⚠️ Répondez à un message contenant le code JS."
        );
      }

      const destination = path.join(__dirname, nomFichier);
      const existait = fs.existsSync(destination);
      const ancienCode = existait ? fs.readFileSync(destination, "utf8") : null;

      try {
        fs.writeFileSync(destination, code, "utf8");
        const { name, aliases } = await chargerCommande(destination, commandes, contexteLoad);
        return envoyer(
          {
            statut: "ok",
            titre: existait ? "COMMANDE MISE À JOUR" : "COMMANDE INSTALLÉE",
            sousTitre: "Disponible immédiatement",
            lignes: [
              { label: "Commande", valeur: name },
              { label: "Fichier", valeur: nomFichier },
              { label: "Taille", valeur: `${(Buffer.byteLength(code, "utf8") / 1024).toFixed(1)} Ko` },
              { label: "Alias", valeur: aliases.length ? aliases.join(", ") : "Aucun" }
            ]
          },
          `✅ « ${nomFichier} » installée sous le nom ${name} !`
        );
      } catch (err) {
        // Annule : restaure l'ancienne version ou supprime le nouveau fichier
        try {
          if (existait) fs.writeFileSync(destination, ancienCode, "utf8");
          else fs.unlinkSync(destination);
          delete require.cache[require.resolve(destination)];
        } catch (e) { /* ignore */ }

        return envoyer(
          erreur("ÉCHEC DE L'INSTALLATION", err.message, [
            { label: "Fichier", valeur: nomFichier },
            { label: "Statut", valeur: existait ? "Ancienne version restaurée" : "Fichier supprimé" }
          ]),
          `❌ Erreur lors de l'installation : ${err.message}`
        );
      }
    }

    // ---------- INVALIDE ----------
    return envoyer(
      erreur("OPTION INVALIDE", "Sous-commande inconnue.", [
        { label: "Recharger", valeur: `${prefix}cmd reload <nom>` },
        { label: "Installer", valeur: `${prefix}cmd install <nom.js>` }
      ]),
      `❌ Option invalide. Utilisez « ${prefix}cmd reload » ou « ${prefix}cmd install ».`
    );
  }
};

// =============== CHARGEMENT DANS LE HANDLER ===============

const POINTS_ENTREE = ["run", "onStart", "onChat", "onReply", "onReaction", "onEvent"];

async function chargerCommande(chemin, commandes, contexteLoad) {
  // Retire l'ancienne version (nom + tous ses alias) de la Map
  let ancien = null;
  try { ancien = require(chemin); } catch (e) { /* fichier neuf ou cassé */ }
  if (ancien) {
    for (const [cle, valeur] of [...commandes]) {
      if (valeur === ancien) commandes.delete(cle);
    }
  }

  delete require.cache[require.resolve(chemin)];
  const cmd = require(chemin);

  const cfg = cmd.config || {};
  if (!cfg.name) throw new Error("config.name manquant dans la commande.");
  if (!POINTS_ENTREE.some((k) => typeof cmd[k] === "function")) {
    throw new Error("Aucun point d'entrée (onStart, run, onChat…) trouvé.");
  }

  const name = String(cfg.name);
  const aliases = Array.isArray(cfg.aliases) ? cfg.aliases.filter(Boolean).map(String) : [];

  commandes.set(name.toLowerCase(), cmd);
  aliases.forEach((a) => commandes.set(a.toLowerCase().trim(), cmd));

  // Le handler n'appelle onLoad qu'au démarrage : on le relance ici
  if (typeof cmd.onLoad === "function") await cmd.onLoad(contexteLoad);

  return { cmd, name, aliases };
}

function erreur(titre, sousTitre, lignes = []) {
  return { statut: "error", titre, sousTitre, lignes };
}

// =============== ENVOI (CANVAS + REPLI TEXTE) ===============

async function envoyerCarte(message, carte, texte) {
  let cheminImg;
  try {
    const buffer = dessinerCarte(carte);
    const dossierCache = path.join(__dirname, "..", "cache");
    if (!fs.existsSync(dossierCache)) fs.mkdirSync(dossierCache, { recursive: true });
    cheminImg = path.join(dossierCache, `cmd_${Date.now()}.png`);
    fs.writeFileSync(cheminImg, buffer);

    return await message.reply({ attachment: fs.createReadStream(cheminImg) }, () =>
      fs.unlink(cheminImg, () => {})
    );
  } catch (e) {
    console.error("⚠️ Impossible de générer l'image de la commande cmd :", e.message);
    if (cheminImg) fs.unlink(cheminImg, () => {});
    return message.reply(texte);
  }
}

// =============== CANVAS ===============

const COULEURS = { info: "#ffd700", ok: "#2ecc71", error: "#e74c3c" };

function tronquer(ctx, texte, largeurMax) {
  let t = String(texte);
  if (ctx.measureText(t).width <= largeurMax) return t;
  while (t.length > 1 && ctx.measureText(t + "…").width > largeurMax) t = t.slice(0, -1);
  return t + "…";
}

function dessinerIcone(ctx, statut, cx, cy, r, couleur) {
  ctx.fillStyle = couleur + "33";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = couleur;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (statut === "ok") {
    ctx.moveTo(cx - r * 0.4, cy);
    ctx.lineTo(cx - r * 0.1, cy + r * 0.32);
    ctx.lineTo(cx + r * 0.45, cy - r * 0.3);
  } else if (statut === "error") {
    ctx.moveTo(cx - r * 0.3, cy - r * 0.3);
    ctx.lineTo(cx + r * 0.3, cy + r * 0.3);
    ctx.moveTo(cx + r * 0.3, cy - r * 0.3);
    ctx.lineTo(cx - r * 0.3, cy + r * 0.3);
  } else {
    ctx.moveTo(cx, cy - r * 0.05);
    ctx.lineTo(cx, cy + r * 0.4);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.38, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = couleur;
    ctx.fill();
    return;
  }
  ctx.stroke();
}

function dessinerCarte({ statut = "info", titre, sousTitre, lignes = [] }) {
  const LARGEUR = 760;
  const HAUT_ENTETE = 130;
  const HAUT_LIGNE = 64;
  const HAUTEUR = HAUT_ENTETE + Math.max(lignes.length, 1) * HAUT_LIGNE + 40;
  const couleur = COULEURS[statut] || COULEURS.info;

  const canvas = createCanvas(LARGEUR, HAUTEUR);
  const ctx = canvas.getContext("2d");

  const fond = ctx.createLinearGradient(0, 0, 0, HAUTEUR);
  fond.addColorStop(0, "#1a1a2e");
  fond.addColorStop(1, "#16213e");
  ctx.fillStyle = fond;
  ctx.fillRect(0, 0, LARGEUR, HAUTEUR);

  ctx.fillStyle = couleur;
  ctx.fillRect(0, 0, 8, HAUTEUR);

  dessinerIcone(ctx, statut, 80, 62, 30, couleur);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = couleur;
  ctx.font = "bold 30px Sans";
  ctx.fillText(tronquer(ctx, titre, LARGEUR - 160), 135, 58);

  if (sousTitre) {
    ctx.fillStyle = "#aaaaaa";
    ctx.font = "16px Sans";
    ctx.fillText(tronquer(ctx, sousTitre, LARGEUR - 160), 135, 86);
  }

  ctx.strokeStyle = couleur + "55";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40, 112);
  ctx.lineTo(LARGEUR - 40, 112);
  ctx.stroke();

  lignes.forEach((ligne, i) => {
    const y = HAUT_ENTETE + i * HAUT_LIGNE;
    const h = HAUT_LIGNE - 14;

    ctx.fillStyle = "#ffffff10";
    ctx.beginPath();
    ctx.roundRect(30, y, LARGEUR - 60, h, 14);
    ctx.fill();

    ctx.fillStyle = couleur;
    ctx.font = "bold 14px Sans";
    ctx.fillText(String(ligne.label).toUpperCase(), 55, y + 22);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 19px Sans";
    ctx.fillText(tronquer(ctx, ligne.valeur, LARGEUR - 130), 55, y + 44);
  });

  return canvas.toBuffer("image/png");
}
