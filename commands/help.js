const fs = require("fs");
const path = require("path");
const { createCanvas } = require("canvas");

const PAR_PAGE = 10;

const ROLES = {
  0: { label: "Membres", couleur: "#2ecc71" },
  1: { label: "Admins groupe", couleur: "#3498db" },
  2: { label: "Admins bot", couleur: "#e74c3c" },
  3: { label: "Propriétaire", couleur: "#9b59b6" }
};

module.exports = {
  config: {
    name: "help",
    aliases: ["aide", "menu"],
    version: "2.0.0",
    author: "YourName",
    countDown: 2,
    role: 0,
    description: "Affiche le menu général ou les détails d'une commande",
    category: "system",
    guide: "{pn} [page | commande]"
  },

  onStart: async function ({ args, message, config, commandes, toUnicodeBold }) {
    const prefix = config.prefix || "!";
    const botName = config.botName || "CÉLESTIN BOT";
    const envoyer = (buffer, texte) => envoyerImage(message, buffer, texte);

    // ---------- DÉTAILS D'UNE COMMANDE ----------
    if (args.length > 0 && !/^\d+$/.test(args[0])) {
      const nom = args[0].toLowerCase().replace(prefix.toLowerCase(), "");
      const cmd = commandes.get(nom);

      if (!cmd) {
        return envoyer(
          () => dessinerCarte({
            statut: "error",
            titre: "COMMANDE INTROUVABLE",
            sousTitre: `« ${nom} » n'existe pas`,
            lignes: [{ label: "Astuce", valeur: `Tapez ${prefix}help pour voir la liste complète` }]
          }),
          `❌ La commande « ${nom} » n'existe pas. Tapez « ${prefix}help » pour la liste.`
        );
      }

      const cfg = cmd.config || {};
      const nomCmd = cfg.name || nom;
      const role = roleRequis(cfg);
      const aliases = Array.isArray(cfg.aliases) && cfg.aliases.length ? cfg.aliases.join(", ") : "Aucun";
      const desc = texteLocalise(cfg.description) || "Aucune description";
      const guide = texteLocalise(cfg.guide);
      const usage = guide
        ? guide.replace(/\{pn\}/g, prefix + nomCmd).replace(/\{p\}/g, prefix).replace(/\{n\}/g, nomCmd)
        : `${prefix}${nomCmd}`;

      const lignes = [
        { label: "Description", valeur: desc },
        { label: "Alias", valeur: aliases },
        { label: "Accès", valeur: (ROLES[role] || ROLES[2]).label },
        { label: "Délai", valeur: `${Number(cfg.countDown ?? cfg.cooldown ?? 2)}s` },
        { label: "Utilisation", valeur: usage }
      ];
      if (cfg.category) lignes.splice(2, 0, { label: "Catégorie", valeur: cfg.category });
      if (cfg.version) lignes.push({ label: "Version", valeur: cfg.version });

      return envoyer(
        () => dessinerCarte({
          statut: "info",
          titre: String(nomCmd).toUpperCase(),
          sousTitre: "Détails de la commande",
          lignes
        }),
        `📖 ${toUnicodeBold(String(nomCmd).toUpperCase())}\n📝 ${desc}\n🏷️ Alias : ${aliases}\n🔒 Accès : ${(ROLES[role] || ROLES[2]).label}\n⏳ Délai : ${Number(cfg.countDown ?? cfg.cooldown ?? 2)}s\n💡 ${usage}`
      );
    }

    // ---------- MENU GÉNÉRAL (paginé, groupé par catégorie) ----------
    const liste = [...new Set(commandes.values())]
      .filter((c) => c.config && c.config.name)
      .map((c) => ({
        nom: String(c.config.name),
        desc: texteLocalise(c.config.description) || "Pas de description",
        categorie: String(c.config.category || "autres").toLowerCase(),
        role: roleRequis(c.config)
      }))
      .sort((a, b) => a.categorie.localeCompare(b.categorie) || a.nom.localeCompare(b.nom));

    const totalPages = Math.max(1, Math.ceil(liste.length / PAR_PAGE));
    const page = Math.min(Math.max(parseInt(args[0], 10) || 1, 1), totalPages);
    const tranche = liste.slice((page - 1) * PAR_PAGE, page * PAR_PAGE);

    const texte =
      `💫 ${toUnicodeBold(botName)} — page ${page}/${totalPages}\n────────────────────\n` +
      tranche.map((c) => `${c.role >= 2 ? "🔒" : "🟢"} ${toUnicodeBold(prefix + c.nom)} — ${c.desc}`).join("\n") +
      `\n────────────────────\n💡 « ${prefix}help <commande> » pour les détails.`;

    return envoyer(
      () => dessinerMenu({ botName, prefix, tranche, page, totalPages, total: liste.length }),
      texte
    );
  }
};

// =============== OUTILS ===============

function roleRequis(cfg) {
  return Number.isInteger(cfg.role) ? cfg.role : cfg.adminOnly ? 2 : 0;
}

/** Accepte une chaîne ou un objet de langues { fr, en } (format GoatBot). */
function texteLocalise(valeur) {
  if (!valeur) return "";
  if (typeof valeur === "string") return valeur;
  if (typeof valeur === "object") return valeur.fr || valeur.en || Object.values(valeur)[0] || "";
  return String(valeur);
}

async function envoyerImage(message, creerBuffer, texte) {
  let cheminImg;
  try {
    const buffer = creerBuffer();
    const dossierCache = path.join(__dirname, "..", "cache");
    if (!fs.existsSync(dossierCache)) fs.mkdirSync(dossierCache, { recursive: true });
    cheminImg = path.join(dossierCache, `help_${Date.now()}.png`);
    fs.writeFileSync(cheminImg, buffer);

    return await message.reply({ attachment: fs.createReadStream(cheminImg) }, () =>
      fs.unlink(cheminImg, () => {})
    );
  } catch (e) {
    console.error("⚠️ Impossible de générer l'image de la commande help :", e.message);
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

/** Coupe un texte en lignes (max `maxLignes`), en respectant les retours à la ligne. */
function envelopper(ctx, texte, largeurMax, maxLignes) {
  const lignes = [];
  for (const paragraphe of String(texte).split("\n")) {
    let courante = "";
    for (const mot of paragraphe.split(/\s+/).filter(Boolean)) {
      const essai = courante ? `${courante} ${mot}` : mot;
      if (ctx.measureText(essai).width <= largeurMax) courante = essai;
      else {
        if (courante) lignes.push(courante);
        courante = mot;
      }
    }
    lignes.push(courante);
  }
  if (lignes.length > maxLignes) {
    const garde = lignes.slice(0, maxLignes);
    garde[maxLignes - 1] = garde[maxLignes - 1].replace(/\s*\S*$/, "") + "…";
    return garde;
  }
  return lignes.length ? lignes : [""];
}

function fondEtBande(ctx, largeur, hauteur, couleur) {
  const fond = ctx.createLinearGradient(0, 0, 0, hauteur);
  fond.addColorStop(0, "#1a1a2e");
  fond.addColorStop(1, "#16213e");
  ctx.fillStyle = fond;
  ctx.fillRect(0, 0, largeur, hauteur);
  ctx.fillStyle = couleur;
  ctx.fillRect(0, 0, 8, hauteur);
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
  if (statut === "error") {
    ctx.moveTo(cx - r * 0.3, cy - r * 0.3);
    ctx.lineTo(cx + r * 0.3, cy + r * 0.3);
    ctx.moveTo(cx + r * 0.3, cy - r * 0.3);
    ctx.lineTo(cx - r * 0.3, cy + r * 0.3);
    ctx.stroke();
  } else {
    // "i" d'information
    ctx.moveTo(cx, cy - r * 0.05);
    ctx.lineTo(cx, cy + r * 0.4);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.38, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = couleur;
    ctx.fill();
  }
}

/** Carte de détails / erreur : lignes label + valeur (valeur sur plusieurs lignes si besoin). */
function dessinerCarte({ statut = "info", titre, sousTitre, lignes = [] }) {
  const LARGEUR = 760;
  const HAUT_ENTETE = 130;
  const couleur = COULEURS[statut] || COULEURS.info;

  const mesure = createCanvas(1, 1).getContext("2d");
  mesure.font = "bold 19px Sans";
  const blocs = lignes.map((l) => {
    const texte = envelopper(mesure, l.valeur, LARGEUR - 130, 4);
    return { label: l.label, texte, hauteur: 42 + texte.length * 24 };
  });

  const HAUTEUR = HAUT_ENTETE + blocs.reduce((s, b) => s + b.hauteur + 12, 0) + 28;
  const canvas = createCanvas(LARGEUR, HAUTEUR);
  const ctx = canvas.getContext("2d");

  fondEtBande(ctx, LARGEUR, HAUTEUR, couleur);
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

  let y = HAUT_ENTETE;
  for (const bloc of blocs) {
    ctx.fillStyle = "#ffffff10";
    ctx.beginPath();
    ctx.roundRect(30, y, LARGEUR - 60, bloc.hauteur, 14);
    ctx.fill();

    ctx.fillStyle = couleur;
    ctx.font = "bold 14px Sans";
    ctx.fillText(String(bloc.label).toUpperCase(), 55, y + 24);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 19px Sans";
    bloc.texte.forEach((t, i) => ctx.fillText(t, 55, y + 50 + i * 24));

    y += bloc.hauteur + 12;
  }

  return canvas.toBuffer("image/png");
}

/** Menu général : commandes groupées par catégorie, avec badge de rôle. */
function dessinerMenu({ botName, prefix, tranche, page, totalPages, total }) {
  const LARGEUR = 760;
  const HAUT_ENTETE = 130;
  const HAUT_CAT = 46;
  const HAUT_CMD = 62;
  const HAUT_PIED = 80;
  const couleur = COULEURS.info;

  // Lignes à dessiner : un en-tête de catégorie à chaque changement
  const rangees = [];
  let derniere = null;
  for (const c of tranche) {
    if (c.categorie !== derniere) {
      rangees.push({ type: "cat", label: c.categorie });
      derniere = c.categorie;
    }
    rangees.push({ type: "cmd", ...c });
  }

  const HAUTEUR =
    HAUT_ENTETE +
    rangees.reduce((s, r) => s + (r.type === "cat" ? HAUT_CAT : HAUT_CMD), 0) +
    HAUT_PIED;

  const canvas = createCanvas(LARGEUR, HAUTEUR);
  const ctx = canvas.getContext("2d");
  fondEtBande(ctx, LARGEUR, HAUTEUR, couleur);

  // En-tête
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "center";
  ctx.fillStyle = couleur;
  ctx.font = "bold 34px Sans";
  ctx.fillText(tronquer(ctx, botName, LARGEUR - 100), LARGEUR / 2, 62);
  ctx.fillStyle = "#aaaaaa";
  ctx.font = "16px Sans";
  ctx.fillText(`${total} commandes  •  Préfixe : ${prefix}`, LARGEUR / 2, 92);

  ctx.strokeStyle = couleur + "55";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40, 112);
  ctx.lineTo(LARGEUR - 40, 112);
  ctx.stroke();

  // Corps
  let y = HAUT_ENTETE;
  for (const r of rangees) {
    if (r.type === "cat") {
      ctx.fillStyle = couleur;
      ctx.beginPath();
      ctx.roundRect(34, y + 12, 6, 20, 3);
      ctx.fill();
      ctx.textAlign = "left";
      ctx.font = "bold 16px Sans";
      ctx.fillText(r.label.toUpperCase(), 50, y + 28);
      y += HAUT_CAT;
      continue;
    }

    const h = HAUT_CMD - 10;
    const rc = (ROLES[r.role] || ROLES[2]).couleur;
    const rl = (ROLES[r.role] || ROLES[2]).label;

    ctx.fillStyle = "#ffffff10";
    ctx.beginPath();
    ctx.roundRect(30, y, LARGEUR - 60, h, 14);
    ctx.fill();

    // pastille de rôle
    ctx.fillStyle = rc;
    ctx.beginPath();
    ctx.arc(54, y + h / 2, 6, 0, Math.PI * 2);
    ctx.fill();

    // nom + description
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 20px Sans";
    ctx.fillText(tronquer(ctx, prefix + r.nom, 330), 74, y + 23);
    ctx.fillStyle = "#aaaaaa";
    ctx.font = "14px Sans";
    ctx.fillText(tronquer(ctx, r.desc, LARGEUR - 290), 74, y + 43);

    // badge de rôle à droite
    const bw = 150;
    const bx = LARGEUR - 30 - bw - 14;
    ctx.fillStyle = rc + "33";
    ctx.beginPath();
    ctx.roundRect(bx, y + (h - 26) / 2, bw, 26, 13);
    ctx.fill();
    ctx.fillStyle = rc;
    ctx.font = "bold 13px Sans";
    ctx.textAlign = "center";
    ctx.fillText(rl, bx + bw / 2, y + h / 2 + 5);

    y += HAUT_CMD;
  }

  // Pied de page
  ctx.textAlign = "center";
  ctx.fillStyle = "#aaaaaa";
  ctx.font = "15px Sans";
  ctx.fillText(`Tapez ${prefix}help <commande> pour les détails`, LARGEUR / 2, y + 28);
  ctx.fillStyle = couleur;
  ctx.font = "bold 15px Sans";
  ctx.fillText(
    totalPages > 1 ? `Page ${page}/${totalPages}  •  ${prefix}help <page>` : `Page ${page}/${totalPages}`,
    LARGEUR / 2,
    y + 54
  );

  return canvas.toBuffer("image/png");
}
