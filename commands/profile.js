const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");

module.exports = {
  config: {
    name: "profile",
    aliases: ["profil", "rank", "pp"],
    version: "1.0.0",
    author: "YourName",
    countDown: 3,
    role: 0,
    adminOnly: false,
    shortDescription: "Affiche une carte de profil",
    longDescription: "Génère une carte visuelle (canvas) avec la photo, le nom et l'ID de la personne — soi-même, une mention, ou une réponse à un message.",
    category: "fun",
    guide: "{pn} (sur soi-même)\n{pn} @mention\n{pn} (en réponse à un message)"
  },

  run: async function ({ api, event, args }) {
    const { threadID, messageID, senderID, mentions, messageReply } = event;

    let cibleID = senderID;
    if (messageReply) cibleID = messageReply.senderID;
    else if (mentions && Object.keys(mentions).length > 0) cibleID = Object.keys(mentions)[0];

    let infos;
    try {
      const resultat = await api.getUserInfo(cibleID);
      infos = resultat[cibleID];
    } catch (e) {
      infos = null;
    }

    const nom = (infos && infos.name) || "Utilisateur inconnu";
    const photo = infos && infos.thumbSrc;

    try {
      const buffer = await dessinerProfil(nom, cibleID, photo);
      const dossierCache = path.join(__dirname, "..", "cache");
      if (!fs.existsSync(dossierCache)) fs.mkdirSync(dossierCache, { recursive: true });
      const cheminImg = path.join(dossierCache, `profile_${Date.now()}.png`);
      fs.writeFileSync(cheminImg, buffer);

      return api.sendMessage(
        { attachment: fs.createReadStream(cheminImg) },
        threadID,
        () => fs.unlinkSync(cheminImg),
        messageID
      );
    } catch (e) {
      console.error("⚠️ Impossible de générer la carte de profil :", e.message);
      return api.sendMessage(`👤 ${nom}\nID : ${cibleID}`, threadID, messageID);
    }
  },

  onStart: async function (context) {
    return this.run(context);
  }
};

async function dessinerProfil(nom, id, photo) {
  const L = 700, H = 360;
  const canvas = createCanvas(L, H);
  const ctx = canvas.getContext("2d");

  // Fond dégradé + bande décorative
  const fond = ctx.createLinearGradient(0, 0, L, H);
  fond.addColorStop(0, "#2b1055");
  fond.addColorStop(1, "#7597de");
  ctx.fillStyle = fond;
  ctx.fillRect(0, 0, L, H);

  ctx.fillStyle = "#ffffff18";
  ctx.beginPath();
  ctx.roundRect(30, 30, L - 60, H - 60, 24);
  ctx.fill();

  // Avatar
  const cx = 150, cy = H / 2, rayon = 80;
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
    } catch (e) { /* fallback initiale ci-dessous */ }
  }
  if (!imageChargee) {
    ctx.fillStyle = "#ffffff33";
    ctx.beginPath();
    ctx.arc(cx, cy, rayon, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 60px Sans";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText((nom[0] || "?").toUpperCase(), cx, cy);
    ctx.textBaseline = "alphabetic";
  }
  ctx.strokeStyle = "#ffd700";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(cx, cy, rayon, 0, Math.PI * 2);
  ctx.stroke();

  // Texte
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 34px Sans";
  ctx.fillText(nom, 270, H / 2 - 20);

  ctx.font = "16px Sans";
  ctx.fillStyle = "#cfd8ff";
  ctx.fillText(`ID : ${id}`, 270, H / 2 + 15);

  ctx.font = "14px Sans";
  ctx.fillStyle = "#9aa6d8";
  const date = new Date().toLocaleDateString("fr-FR");
  ctx.fillText(`Carte générée le ${date}`, 270, H / 2 + 45);

  return canvas.toBuffer("image/png");
}
