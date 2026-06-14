const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const { pool } = require('../config/database');
const authMiddleware = require('../middleware/auth');

const SECRET = process.env.JWT_SECRET || 'niksante_dev_secret';

// Accepte soit X-Admin-Key, soit un token JWT admin (pour la page web admin)
function adminOrKey(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (key && key === process.env.ADMIN_NOTIFICATION_KEY) return next();

  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(auth.slice(7), SECRET);
      if (payload.role === 'admin') return next();
    } catch {}
  }
  return res.status(403).json({ error: 'Non autorisé' });
}

// Chargement optionnel de expo-server-sdk
let expo = null;
let ExpoSDK = null;
try {
  const { Expo } = require('expo-server-sdk');
  ExpoSDK = Expo;
  expo = new Expo();
  console.log('[Notifications] expo-server-sdk chargé');
} catch {
  console.warn('[Notifications] expo-server-sdk non installé — envoi désactivé');
}

// ── POST /api/notifications/register ─────────────────────────────────────────
// Enregistre le token push de l'utilisateur connecté.

router.post('/register', authMiddleware, async (req, res) => {
  const { token } = req.body;
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Token push requis' });
  }

  if (ExpoSDK && !ExpoSDK.isExpoPushToken(token)) {
    return res.status(400).json({ error: 'Format de token Expo invalide' });
  }

  try {
    await pool.query(
      'UPDATE users SET push_token = $1 WHERE id = $2',
      [token, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[Notifications] register:', err.message);
    res.status(500).json({ error: 'Erreur base de données' });
  }
});

// ── GET /api/notifications/stats ─────────────────────────────────────────────
// Retourne le nombre de tokens push enregistrés (pour l'admin).

router.get('/stats', adminOrKey, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT push_token FROM users WHERE push_token IS NOT NULL'
    );
    const all    = rows.map(r => r.push_token);
    const valid  = ExpoSDK ? all.filter(t => ExpoSDK.isExpoPushToken(t)) : all;
    res.json({ total: all.length, validExpo: valid.length });
  } catch (err) {
    console.error('[Notifications] stats:', err.message);
    res.status(500).json({ error: 'Erreur base de données' });
  }
});

// ── POST /api/notifications/send-update ──────────────────────────────────────
// Envoie une notification de mise à jour à tous les utilisateurs.
// Protégé par clé admin (header X-Admin-Key).
//
// Body : { version, changelog, title?, body? }
// Exemple :
//   curl -X POST https://niksante-backend.onrender.com/api/notifications/send-update \
//     -H "Content-Type: application/json" \
//     -H "X-Admin-Key: votre-cle-secrete" \
//     -d '{"version":"1.1.0","changelog":"Mesure cardiaque PPG, conversion mmol/L..."}'

router.post('/send-update', adminOrKey, async (req, res) => {

  if (!expo) {
    return res.status(503).json({ error: 'expo-server-sdk non installé sur le serveur' });
  }

  const { version, changelog, title, body } = req.body;
  if (!version) {
    return res.status(400).json({ error: 'Champ "version" requis' });
  }

  try {
    // Récupère tous les tokens valides
    const { rows } = await pool.query(
      'SELECT push_token FROM users WHERE push_token IS NOT NULL'
    );

    const tokens = rows
      .map(r => r.push_token)
      .filter(t => ExpoSDK.isExpoPushToken(t));

    if (tokens.length === 0) {
      return res.json({ sent: 0, total: 0, message: 'Aucun token enregistré' });
    }

    const notifTitle    = title    || `🆕 NikSanté ${version} disponible !`;
    const notifBody     = body     || changelog || 'Une nouvelle version est disponible. Mettez à jour pour profiter des améliorations.';
    const notifChangelog = changelog || '';

    const messages = tokens.map((to) => ({
      to,
      channelId: 'updates',
      sound:     'default',
      title:     notifTitle,
      body:      notifBody,
      data:      { type: 'update', version, changelog: notifChangelog },
      priority:  'high',
    }));

    // Expo recommande d'envoyer par chunks de 100
    const chunks = expo.chunkPushNotifications(messages);
    let sent   = 0;
    const errs = [];

    for (const chunk of chunks) {
      try {
        const tickets = await expo.sendPushNotificationsAsync(chunk);
        tickets.forEach((ticket) => {
          if (ticket.status === 'ok') sent++;
          else if (ticket.message) errs.push(ticket.message);
        });
      } catch (err) {
        errs.push(err.message);
      }
    }

    console.log(`[Notifications] Envoi v${version} : ${sent}/${tokens.length}`);
    res.json({ sent, total: tokens.length, errors: errs.slice(0, 5) });

  } catch (err) {
    console.error('[Notifications] send-update:', err.message);
    res.status(500).json({ error: 'Erreur lors de l\'envoi' });
  }
});

module.exports = router;
