const fs = require("fs");
const path = require("path");
const { threadsData, usersData } = require("./data.js");

/* ============================================================
   Commandes : formats acceptés
   - GoatBot : config{name,aliases,role,countDown,usePrefix} + onStart / onChat / onReply / onReaction / onEvent / onLoad
   - Ancien  : config{name,aliases,adminOnly,cooldown} + run
   Rôles : 0 = tout le monde | 1 = admin du groupe | 2 = admin du bot | 3 = propriétaire
   ============================================================ */

const cooldowns = new Map();
const cacheAdmins = new Map(); // threadID -> { t, ids }

/** Texte en police Unicode (gardé pour les commandes qui l'utilisent). */
function toUnicodeBold(str = "") {
  const normal = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bold = Array.from(
    "𝖺𝖻𝖼𝖽𝖾𝖿𝗀𝗁𝗂𝗃𝗄𝗅𝗆𝗇𝗈𝗉𝗊𝗋𝗌𝗍𝗎𝗏𝗐𝗑𝗒𝗓" +
    "𝖠𝖡𝖢𝖣𝖤𝖥𝖦𝖧𝖨𝖩𝖪𝖫𝖬𝖭𝖮𝖯𝖰𝖱𝖲𝖳𝖴𝖵𝖶𝖷𝖸𝖹" +
    "𝟢𝟣𝟤𝟥𝟦𝟧𝟨𝟩𝟪𝟫"
  );
  return Array.from(str)
    .map((char) => {
      const index = normal.indexOf(char);
      return index !== -1 ? bold[index] || char : char;
    })
    .join("");
}

/** Liste des commandes uniques (sans les doublons d'alias). */
function uniques(commandes) {
  return [...new Set(commandes.values())];
}

/** Charge toutes les commandes du dossier commands/ (récursif, un fichier cassé n'arrête rien). */
function chargerCommandes(dossier) {
  const commandes = new Map();
  if (!fs.existsSync(dossier)) {
    fs.mkdirSync(dossier, { recursive: true });
    return commandes;
  }

  const fichiers = fs.readdirSync(dossier).filter((f) => f.endsWith(".js"));
  for (const fichier of fichiers) {
    try {
      const chemin = path.join(dossier, fichier);
      delete require.cache[require.resolve(chemin)];
      const commande = require(chemin);
      const cfg = commande.config || {};
      const nom = cfg.name;
      const aUnPointDEntree = ["run", "onStart", "onChat", "onReply", "onReaction", "onEvent"]
        .some((k) => typeof commande[k] === "function");

      if (!nom || !aUnPointDEntree) {
        console.warn(`⚠️  Commande ignorée (manque config.name ou onStart/run) : ${fichier}`);
        continue;
      }

      commandes.set(String(nom).toLowerCase(), commande);
      if (Array.isArray(cfg.aliases)) {
        cfg.aliases.forEach((a) => { if (a) commandes.set(String(a).toLowerCase().trim(), commande); });
      }
    } catch (e) {
      console.error(`❌ Erreur lors du chargement de ${fichier} :`, e.message);
    }
  }
  return commandes;
}

/** Appelle onLoad de chaque commande (une fois, après la connexion). */
async function lancerOnLoad({ api, commandes }) {
  for (const cmd of uniques(commandes)) {
    if (typeof cmd.onLoad !== "function") continue;
    try {
      await cmd.onLoad({ api, threadsData, usersData, commandes, global });
    } catch (e) {
      console.error(`❌ onLoad [${cmd.config && cmd.config.name}] :`, e.message);
    }
  }
}

/* ---------- envoi de messages (compatible GoatBot : message.reply / send / unsend / reaction) ---------- */

function envoyer(api, contenu, threadID, replyID) {
  return new Promise((resolve) => {
    try {
      // Ordre correct : sendMessage(contenu, threadID, callback, messageIDàRépondre)
      api.sendMessage(contenu, threadID, (err, info) => {
        if (err) console.error("⚠️ Envoi impossible :", (err && err.message) || err);
        resolve(err ? null : info);
      }, replyID);
    } catch (e) {
      console.error("⚠️ Envoi impossible :", e.message);
      resolve(null);
    }
  });
}

function creerMessage(api, event) {
  const avecCb = (p, cb) => p.then((info) => { if (typeof cb === "function") cb(null, info); return info; });
  return {
    reply: (c, cb) => avecCb(envoyer(api, c, event.threadID, event.messageID), cb),
    send: (c, tid, cb) => avecCb(envoyer(api, c, tid || event.threadID), cb),
    unsend: (mid) => new Promise((r) => { try { api.unsendMessage(mid, () => r()); } catch (e) { r(); } }),
    reaction: (emoji, mid) => { try { api.setMessageReaction(emoji, mid || event.messageID, () => {}, true); } catch (e) {} },
    err: (e) => envoyer(api, "❌ " + ((e && e.message) || e), event.threadID, event.messageID)
  };
}

/* ---------- autorisations ---------- */

async function estAdminGroupe(api, threadID, userID) {
  const c = cacheAdmins.get(threadID);
  if (c && Date.now() - c.t < 60000) return c.ids.includes(String(userID));

  const ids = await new Promise((res) => {
    let fini = false;
    const to = setTimeout(() => { if (!fini) { fini = true; res(null); } }, 8000);
    try {
      api.getThreadInfo(threadID, (err, info) => {
        if (fini) return;
        fini = true; clearTimeout(to);
        res(err || !info ? null : (info.adminIDs || []).map((a) => String(a.id || a)));
      });
    } catch (e) { clearTimeout(to); res(null); }
  });

  if (!ids) return false;
  cacheAdmins.set(threadID, { t: Date.now(), ids });
  return ids.includes(String(userID));
}

async function calculerRole(api, event, config) {
  const id = String(event.senderID);
  if ((config.owners || []).map(String).includes(id)) return 3;
  if ((config.admins || []).map(String).includes(id)) return 2;
  if (event.isGroup !== false && String(event.threadID) !== id) {
    if (await estAdminGroupe(api, event.threadID, id)) return 1;
  }
  return 0;
}

/** Bannis, bot éteint, liste blanche : retourne false si le message doit être ignoré. */
function accesAutorise(config, event, role) {
  if (role >= 2) return true;
  const id = String(event.senderID);
  if ((config.banned || []).map(String).includes(id)) return false;
  if (config.botActif === false) return false;
  if (config.whitelistActive) {
    const okThread = (config.whitelistThreads || []).map(String).includes(String(event.threadID));
    const okUser = (config.whitelistUsers || []).map(String).includes(id);
    if (!okThread && !okUser) return false;
  }
  return true;
}

const NOMS_ROLES = {
  1: "⛔ Cette commande est réservée aux admins du groupe.",
  2: "⛔ Cette commande est réservée aux administrateurs du bot.",
  3: "⛔ Cette commande est réservée au propriétaire du bot."
};

/* ---------- messages système (variés) ---------- */

const MESSAGES_PREFIXE_SEUL = [
  (p) => `Hey 👋 tu viens de taper le préfixe seul (« ${p} ») — tu veux faire quoi exactement ? 🤔\nTape « ${p}help » pour voir les commandes.`,
  (p) => `💫 Oui ? Il manque le nom de la commande après « ${p} ».\nEssaie « ${p}help » pour la liste complète.`,
  (p) => `🙂 Je t'écoute, mais « ${p} » seul ne veut rien dire pour moi.\nTape « ${p}help » et je te montre tout.`
];
const MESSAGES_COMMANDE_INCONNUE = [
  (p, n) => `❌ La commande « ${n} » n'existe pas.\n💡 Tape « ${p}help » pour voir le menu.`,
  (p, n) => `🤷 Je ne connais pas « ${n} ».\nEssaie « ${p}help » pour la liste des commandes.`
];
const auHasard = (liste, ...a) => liste[Math.floor(Math.random() * liste.length)](...a);

/* ---------- traitement des messages ---------- */

async function gererMessage({ api, event, config, commandes }) {
  if (event.threadID) threadsData.touch(event.threadID, event.isGroup);

  const body = (event.body || "").trim();
  const prefix = config.prefix || "!";

  const role = await calculerRole(api, event, config);
  if (!accesAutorise(config, event, role)) return;

  const message = creerMessage(api, event);
  const ctx = {
    api, event, message, role, config, commandes, threadsData, usersData,
    toUnicodeBold, global, reply: (t) => message.reply(t)
  };
  const argsBrut = body ? body.split(/\s+/) : [];

  // 1. Réponse à un message du bot (onReply)
  const rep = event.messageReply;
  if (event.type === "message_reply" && rep && global.GoatBot.onReply.has(rep.messageID)) {
    const Reply = global.GoatBot.onReply.get(rep.messageID);
    const cmd = commandes.get(String(Reply.commandName || "").toLowerCase());
    if (cmd && typeof cmd.onReply === "function") {
      try {
        await cmd.onReply({ ...ctx, args: argsBrut, Reply, commandName: cmd.config.name });
      } catch (e) {
        console.error(`💥 onReply [${cmd.config.name}] :`, e);
        message.reply("💥 Une erreur est survenue pendant ta réponse.");
      }
      return;
    }
  }

  // 2. onChat : lu pour tous les messages
  for (const cmd of uniques(commandes)) {
    if (typeof cmd.onChat !== "function") continue;
    try {
      await cmd.onChat({ ...ctx, args: argsBrut, commandName: cmd.config.name, isUserCallCommand: false });
    } catch (e) {
      console.error(`💥 onChat [${cmd.config.name}] :`, e.message);
    }
  }

  if (!body) return;

  // 3. Détection de la commande (avec ou sans préfixe)
  let texte = body;
  let avecPrefixe = false;
  if (body.startsWith(prefix)) {
    avecPrefixe = true;
    texte = body.slice(prefix.length).trim();
    if (!texte) return message.reply(auHasard(MESSAGES_PREFIXE_SEUL, prefix));
  }

  const args = texte.split(/\s+/);
  const nomCommande = (args.shift() || "").toLowerCase();
  const commande = commandes.get(nomCommande);

  if (!commande) {
    if (avecPrefixe) return message.reply(auHasard(MESSAGES_COMMANDE_INCONNUE, prefix, nomCommande));
    return; // sans préfixe : on ignore les mots qui ne sont pas des commandes
  }

  const cfg = commande.config || {};
  if (!avecPrefixe) {
    const sansPrefixeAutorise = cfg.usePrefix === false || (config.sansPrefixe && cfg.sansPrefixe !== false);
    if (!sansPrefixeAutorise) return;
  }

  // 4. Autorisations
  const roleRequis = Number.isInteger(cfg.role) ? cfg.role : (cfg.adminOnly ? 2 : 0);
  if (role < roleRequis) return message.reply(NOMS_ROLES[roleRequis] || NOMS_ROLES[2]);

  const enGroupe = event.isGroup !== false && String(event.threadID) !== String(event.senderID);
  if (cfg.groupOnly && !enGroupe) return message.reply("ℹ️ Cette commande fonctionne seulement dans un groupe.");
  if (cfg.pmOnly && enGroupe) return message.reply("ℹ️ Cette commande fonctionne seulement en message privé.");

  // 5. Délai anti-spam (les admins du bot ne sont pas limités)
  const secondes = Number(cfg.countDown ?? cfg.cooldown ?? 2);
  if (role < 2 && secondes > 0) {
    const cle = `${event.senderID}_${cfg.name}`;
    const maintenant = Date.now();
    const fin = (cooldowns.get(cle) || 0) + secondes * 1000;
    if (maintenant < fin) {
      return message.reply(`⏳ Patiente ${((fin - maintenant) / 1000).toFixed(1)}s avant de réutiliser « ${nomCommande} ».`);
    }
    cooldowns.set(cle, maintenant);
    setTimeout(() => cooldowns.delete(cle), secondes * 1000).unref?.();
  }

  // 6. Exécution
  try {
    if (typeof commande.onStart === "function") {
      await commande.onStart({ ...ctx, args, commandName: cfg.name, usedPrefix: avecPrefixe });
    } else if (typeof commande.run === "function") {
      await commande.run({ ...ctx, args });
    } else if (typeof commande.onChat === "function") {
      await commande.onChat({ ...ctx, args, commandName: cfg.name, isUserCallCommand: true });
    }
  } catch (error) {
    console.error(`💥 Erreur d'exécution [${nomCommande}] :`, error);
    message.reply(`💥 Une erreur est survenue dans « ${nomCommande} ».\n(détail enregistré dans la console du bot)`);
  }
}

/** Réactions et événements de groupe (onReaction / onEvent). */
async function gererEvenement({ api, event, config, commandes }) {
  const auteur = String(event.userID || event.senderID || "");
  if ((config.banned || []).map(String).includes(auteur)) return;

  const message = creerMessage(api, event);
  const ctx = { api, event, message, config, commandes, threadsData, usersData, toUnicodeBold, global };

  if (event.type === "message_reaction" && global.GoatBot.onReaction.has(event.messageID)) {
    const Reaction = global.GoatBot.onReaction.get(event.messageID);
    const cmd = commandes.get(String(Reaction.commandName || "").toLowerCase());
    if (cmd && typeof cmd.onReaction === "function") {
      try { await cmd.onReaction({ ...ctx, Reaction }); }
      catch (e) { console.error(`💥 onReaction [${cmd.config.name}] :`, e.message); }
    }
  }

  for (const cmd of uniques(commandes)) {
    if (typeof cmd.onEvent !== "function") continue;
    try { await cmd.onEvent({ ...ctx, commandName: cmd.config.name }); }
    catch (e) { console.error(`💥 onEvent [${cmd.config.name}] :`, e.message); }
  }
}

module.exports = {
  chargerCommandes,
  gererMessage,
  gererEvenement,
  lancerOnLoad,
  uniques,
  toUnicodeBold
};
