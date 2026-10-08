const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");

module.exports = {
  config: {
    name: "admin",
    aliases: ["admins", "owner"],
    version: "1.1.0",
    author: "YourName",
    countDown: 2,
    role: 1,          // Garder pour référence / compatibilité GoatBot
    adminOnly: true,  // ⚠️ IMPORTANT : c'est CE champ que le handler du mini-bot lit réellement
    shortDescription: "Gère la liste des administrateurs du bot",
    longDescription: "Permet d'ajouter, de supprimer ou d'afficher la liste des UIDs enregistrés comme administrateurs dans config.json.",
    category: "system",
    guide: "{pn} [add | remove | list] [UID / Mention / Réponse]"
  },

  run: async function ({ api, event, args, config }) {
    const { threadID, messageID, mentions, messageReply } = event;
    const prefix = config.prefix || "!";
    const action = (args[0] || "list").toLowerCase();

    if (action === "list") {
      return envoyerListeAdmins({ api, threadID, messageID, config });
    }

    let targetID = args[1];
    if (messageReply) {
      targetID = messageReply.senderID;
    } else if (mentions && Object.keys(mentions).length > 0) {
      targetID = Object.keys(mentions)[0];
    }

    if (!targetID && (action === "add" || action === "remove" || action === "del")) {
      return api.sendMessage(
        `⚠️ Veuillez spécifier un UID, mentionner un membre ou répondre à un message.\nExemple : \`${prefix}admin add 61591895887142\``,
        threadID,
        messageID
      );
    }

    if (!Array.isArray(config.admins)) {
      config.admins = [];
    }

    if (action === "add") {
      if (config.admins.includes(targetID)) {
        return api.sendMessage(`⚠️ L'utilisateur \`${targetID}\` est déjà administrateur.`, threadID, messageID);
      }
      config.admins.push(targetID);
      sauvegarderConfig(config);
      return api.sendMessage(`✅ L'utilisateur \`${targetID}\` a été ajouté comme administrateur du bot.`, threadID, messageID);
    }

    if (action === "remove" || action === "del") {
      if (!config.admins.includes(targetID)) {
        return api.sendMessage(`⚠️ L'utilisateur \`${targetID}\` ne fait pas partie des administrateurs.`, threadID, messageID);
      }
      config.admins = config.admins.filter((id) => id !== targetID);
      sauvegarderConfig(config);
      return api.sendMessage(`✅ L'utilisateur \`${targetID}\` a été retiré des administrateurs.`, threadID, messageID);
    }

    return api.sendMessage(
      `❌ Sous-commande invalide. Utilisez : \`${prefix}admin list\`, \`${prefix}admin add <UID>\` ou \`${prefix}admin remove <UID>\`.`,
      threadID,
      messageID
    );
  },

  onStart: async function (context) {
    return this.run(context);
  }
};

// =============== LISTE DES ADMINS — VERSION CANVAS ===============

async function envoyerListeAdmins({ api, threadID, messageID, config }) {
  const adminList = Array.isArray(config.admins) ? config.admins : [];

  if (adminList.length === 0) {
    return api.sendMessage("👑 Aucun administrateur enregistré dans config.json.", threadID, messageID);
  }

  // Récupère noms + photos de profil si l'API le permet (échec silencieux sinon)
  let infos = {};
  try {
    infos = await api.getUserInfo(adminList);
  } catch (e) {
    infos = {};
  }

  try {
    const buffer = await dessinerListeAdmins(adminList, infos);
    const dossierCache = path.join(__dirname, "..", "cache");
    if (!fs.existsSync(dossierCache)) fs.mkdirSync(dossierCache, { recursive: true });
    const cheminImg = path.join(dossierCache, `admins_${Date.now()}.png`);
    fs.writeFileSync(cheminImg, buffer);

    await api.sendMessage(
      { attachment: fs.createReadStream(cheminImg) },
      threadID,
      () => fs.unlinkSync(cheminImg),
      messageID
    );
  } catch (e) {
    console.error("⚠️ Impossible de générer l'image des administrateurs :", e.message);
  }

  // Texte envoyé après l'image, comme recap (toujours utile si l'image échoue)
  let texte = `👑 LISTE DES ADMINISTRATEURS (${adminList.length})\n────────────────────\n`;
  adminList.forEach((id, i) => {
    const nom = (infos[id] && infos[id].name) || "Nom inconnu";
    texte += `${i + 1}. ${nom} — ${id}\n`;
  });
  return api.sendMessage(texte, threadID);
}

async function dessinerListeAdmins(adminList, infos) {
  const LARGEUR = 760;
  const HAUT_LIGNE = 90;
  const HAUT_ENTETE = 110;
  const HAUTEUR = HAUT_ENTETE + adminList.length * HAUT_LIGNE + 30;

  const canvas = createCanvas(LARGEUR, HAUTEUR);
  const ctx = canvas.getContext("2d");

  const fond = ctx.createLinearGradient(0, 0, 0, HAUTEUR);
  fond.addColorStop(0, "#1a1a2e");
  fond.addColorStop(1, "#16213e");
  ctx.fillStyle = fond;
  ctx.fillRect(0, 0, LARGEUR, HAUTEUR);

  ctx.fillStyle = "#ffd700";
  ctx.font = "bold 32px Sans";
  ctx.textAlign = "center";
  ctx.fillText(`👑 Administrateurs du bot (${adminList.length})`, LARGEUR / 2, 55);

  for (let i = 0; i < adminList.length; i++) {
    const id = adminList[i];
    const y = HAUT_ENTETE + i * HAUT_LIGNE;
    const nom = (infos[id] && infos[id].name) || "Nom inconnu";
    const photo = infos[id] && infos[id].thumbSrc;

    ctx.fillStyle = "#ffffff10";
    ctx.beginPath();
    ctx.roundRect(30, y, LARGEUR - 60, HAUT_LIGNE - 15, 14);
    ctx.fill();

    const cx = 80, cy = y + (HAUT_LIGNE - 15) / 2, rayon = 28;
    let imageChargee = false;

    if (photo) {
      try {
        const img = await loadImage(photo);
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, rayon, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, cx - rayon, cy - rayon, rayon * 2, rayon * 2);
        ctx.restore();
        imageChargee = true;
      } catch (e) {
        // on retombe sur les initiales si la photo ne charge pas
      }
    }

    if (!imageChargee) {
      ctx.fillStyle = "#ffd70033";
      ctx.beginPath();
      ctx.arc(cx, cy, rayon, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffd700";
      ctx.font = "bold 22px Sans";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText((nom[0] || "?").toUpperCase(), cx, cy);
      ctx.textBaseline = "alphabetic";
    }

    ctx.strokeStyle = "#ffd700";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, rayon, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#ffd700";
    ctx.font = "bold 14px Sans";
    ctx.textAlign = "left";
    ctx.fillText(`#${i + 1}`, 30, y + 16);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 20px Sans";
    ctx.fillText(nom, cx + rayon + 20, cy - 4);

    ctx.fillStyle = "#aaaaaa";
    ctx.font = "14px Sans";
    ctx.fillText(id, cx + rayon + 20, cy + 18);
  }

  return canvas.toBuffer("image/png");
}

// =============== SAUVEGARDE CONFIG ===============

function sauvegarderConfig(config) {
  try {
    // __dirname = .../mini-bot/commands → on remonte d'un niveau pour config.json
    // (plus fiable que process.cwd(), qui dépend d'où "node index.js" est lancé)
    const cheminConfig = path.join(__dirname, "..", "config.json");
    fs.writeFileSync(cheminConfig, JSON.stringify(config, null, 2), "utf8");
  } catch (err) {
    console.error("❌ Impossible de mettre à jour config.json :", err);
  }
}
