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
    const { rows } = await pool.query(
      'SELECT id, push_token FROM users WHERE push_token IS NOT NULL'
    );

    const users = rows.filter(r => ExpoSDK.isExpoPushToken(r.push_token));

    if (users.length === 0) {
      return res.json({ sent: 0, total: 0, message: 'Aucun token enregistré' });
    }

    const notifTitle     = title    || `🆕 NikSanté ${version} disponible !`;
    const notifBody      = body     || changelog || 'Une nouvelle version est disponible. Mettez à jour pour profiter des améliorations.';
    const notifChangelog = changelog || '';

    let sent    = 0;
    let removed = 0;
    const errs  = [];

    // Envoi individuel : évite l'erreur "same project" quand la BDD contient
    // des tokens de projets Expo différents mélangés (ex : après changement d'ID).
    // Supprime automatiquement les tokens invalides / révoqués.
    for (const user of users) {
      try {
        const [ticket] = await expo.sendPushNotificationsAsync([{
          to:        user.push_token,
          channelId: 'updates',
          sound:     'default',
          title:     notifTitle,
          body:      notifBody,
          data:      { type: 'update', version, changelog: notifChangelog },
          priority:  'high',
        }]);

        if (ticket.status === 'ok') {
          sent++;
        } else {
          const detail = ticket.details?.error || '';
          const msg    = ticket.message || detail || 'Erreur inconnue';
          errs.push(`[…${user.push_token.slice(-6)}] ${msg}`);
          if (
            detail === 'DeviceNotRegistered' ||
            msg.includes('same project') ||
            msg.includes('InvalidCredentials') ||
            msg.includes('FCM server key')
          ) {
            await pool.query('UPDATE users SET push_token = NULL WHERE id = $1', [user.id]);
            removed++;
          }
        }
      } catch (err) {
        const msg = err.message || 'Erreur inconnue';
        errs.push(`[…${user.push_token.slice(-6)}] ${msg}`);
        if (msg.includes('same project') || msg.includes('InvalidCredentials') || msg.includes('FCM server key')) {
          await pool.query('UPDATE users SET push_token = NULL WHERE id = $1', [user.id]);
          removed++;
        }
      }
    }

    console.log(`[Notifications] Envoi v${version} : ${sent}/${users.length} (${removed} token(s) supprimé(s))`);
    res.json({ sent, total: users.length, removed, errors: errs.slice(0, 10) });

  } catch (err) {
    console.error('[Notifications] send-update:', err.message);
    res.status(500).json({ error: 'Erreur lors de l\'envoi' });
  }
});

module.exports = router;
