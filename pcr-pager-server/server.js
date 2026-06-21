/* =========================================================================
 * Servidor de paging (Web Push) do app de Manejo de PCR.
 *
 * Recebe inscrições (subscriptions) dos aparelhos dos membros e, ao receber
 * um "Código Azul" (POST /page), dispara uma notificação push para todos os
 * membros inscritos na mesma equipe/unidade.
 *
 * ATENÇÃO (honestidade clínica): Web Push entrega uma NOTIFICAÇÃO. Tocar um
 * alarme ALTO com o app fechado/bloqueado NÃO é garantido pelos navegadores —
 * especialmente no iOS (exige app nativo com "critical alerts"). Veja o
 * arquivo pcr/PAGER.md. Use este servidor como acionamento complementar.
 *
 * Persistência: arquivo JSON local (subscriptions.json). Para produção séria,
 * troque por um banco de dados e adicione autenticação.
 * ========================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const webpush = require('web-push');

const PORT = process.env.PORT || 8080;
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
const STORE_FILE = process.env.STORE_FILE || path.join(__dirname, 'subscriptions.json');
const TOKENS_FILE = process.env.TOKENS_FILE || path.join(__dirname, 'tokens.json');

if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
  console.error('\n[ERRO] Defina VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY.');
  console.error('Gere com:  npm run gen-keys\n');
  process.exit(1);
}
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

/* ---- FCM opcional (app nativo). Ativa se FIREBASE_SERVICE_ACCOUNT existir. ---- */
let admin = null, fcmReady = false;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    admin = require('firebase-admin');
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
    fcmReady = true;
    console.log('FCM (app nativo) habilitado.');
  }
} catch (e) { console.error('FCM não inicializado:', e.message); }

/* ---- persistência simples em arquivo ---- */
let subs = []; // Web Push: { id, team, name, subscription, createdAt }
let tokens = []; // FCM: { id, team, name, token, platform, createdAt }
function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')) || []; } catch (e) { return []; } }
function load() { subs = readJson(STORE_FILE); tokens = readJson(TOKENS_FILE); }
function persist() {
  try { fs.writeFileSync(STORE_FILE, JSON.stringify(subs)); } catch (e) { console.error('store subs:', e.message); }
  try { fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens)); } catch (e) { console.error('store tokens:', e.message); }
}
load();

const app = express();
app.use(cors());
app.use(express.json({ limit: '64kb' }));

app.get('/health', (req, res) => res.json({ ok: true, subscriptions: subs.length, tokens: tokens.length, fcm: fcmReady }));

// Chave pública VAPID — o cliente busca aqui para se inscrever.
app.get('/vapidPublicKey', (req, res) => res.type('text/plain').send(VAPID_PUBLIC));

// Inscrição de um aparelho numa equipe/unidade.
app.post('/subscribe', (req, res) => {
  const { team, name, subscription } = req.body || {};
  if (!team || !subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'team e subscription são obrigatórios' });
  }
  // remove inscrição anterior com o mesmo endpoint (re-inscrição)
  subs = subs.filter((s) => s.subscription.endpoint !== subscription.endpoint);
  subs.push({ id: Date.now() + '-' + Math.random().toString(36).slice(2), team: String(team), name: String(name || ''), subscription, createdAt: Date.now() });
  persist();
  res.json({ ok: true, team, count: subs.filter((s) => s.team === String(team)).length });
});

app.post('/unsubscribe', (req, res) => {
  const { endpoint } = req.body || {};
  if (!endpoint) return res.status(400).json({ error: 'endpoint obrigatório' });
  const before = subs.length;
  subs = subs.filter((s) => s.subscription.endpoint !== endpoint);
  persist();
  res.json({ ok: true, removed: before - subs.length });
});

// Registro de token nativo (FCM/APNs via FCM) numa equipe.
app.post('/registerToken', (req, res) => {
  const { team, name, token, platform } = req.body || {};
  if (!team || !token) return res.status(400).json({ error: 'team e token são obrigatórios' });
  tokens = tokens.filter((t) => t.token !== token);
  tokens.push({ id: Date.now() + '-' + Math.random().toString(36).slice(2), team: String(team), name: String(name || ''), token: String(token), platform: String(platform || ''), createdAt: Date.now() });
  persist();
  res.json({ ok: true, team: String(team), count: tokens.filter((t) => t.team === String(team)).length });
});

app.post('/unregisterToken', (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'token obrigatório' });
  const before = tokens.length;
  tokens = tokens.filter((t) => t.token !== token);
  persist();
  res.json({ ok: true, removed: before - tokens.length });
});

// Dispara o Código Azul para todos os membros da equipe (Web Push + FCM).
app.post('/page', async (req, res) => {
  const { team, by, roles, message } = req.body || {};
  if (!team) return res.status(400).json({ error: 'team obrigatório' });
  const teamS = String(team);
  const body = message || ('Acionamento da equipe' + (by ? ' — por ' + by : ''));
  const rolesArr = Array.isArray(roles) ? roles : [];

  // --- Web Push ---
  const targets = subs.filter((s) => s.team === teamS);
  const payload = JSON.stringify({ title: '🔵 CÓDIGO AZUL', body, team: teamS, roles: rolesArr, ts: Date.now() });
  const stale = [];
  const webResults = await Promise.all(targets.map((s) =>
    webpush.sendNotification(s.subscription, payload).then(() => true).catch((err) => {
      if (err && (err.statusCode === 404 || err.statusCode === 410)) stale.push(s.subscription.endpoint);
      return false;
    })
  ));
  if (stale.length) { subs = subs.filter((s) => stale.indexOf(s.subscription.endpoint) === -1); persist(); }

  // --- FCM (app nativo: alarme crítico) ---
  let fcmSent = 0;
  const teamTokens = tokens.filter((t) => t.team === teamS);
  if (fcmReady && teamTokens.length) {
    // NOTA: a entrega de "critical alert" no iOS com app encerrado exige a
    // entitlement aprovada pela Apple e deve ser validada em dispositivo real.
    const msg = {
      tokens: teamTokens.map((t) => t.token),
      data: { title: '🔵 CÓDIGO AZUL', body, team: teamS, roles: JSON.stringify(rolesArr), ts: String(Date.now()) },
      android: { priority: 'high' },
      apns: {
        headers: { 'apns-priority': '10', 'apns-push-type': 'alert' },
        payload: { aps: { alert: { title: '🔵 CÓDIGO AZUL', body }, sound: { critical: 1, name: 'alarm.caf', volume: 1.0 }, 'interruption-level': 'critical' } }
      }
    };
    try {
      const r = await admin.messaging().sendEachForMulticast(msg);
      fcmSent = r.successCount;
      const dead = [];
      r.responses.forEach((resp, i) => { if (!resp.success) { const code = resp.error && resp.error.code; if (code === 'messaging/registration-token-not-registered') dead.push(teamTokens[i].token); } });
      if (dead.length) { tokens = tokens.filter((t) => dead.indexOf(t.token) === -1); persist(); }
    } catch (e) { console.error('FCM send:', e.message); }
  }

  res.json({
    ok: true, team: teamS,
    webPush: { targets: targets.length, sent: webResults.filter(Boolean).length, removedStale: stale.length },
    fcm: { enabled: fcmReady, targets: teamTokens.length, sent: fcmSent }
  });
});

app.listen(PORT, () => console.log('pcr-pager-server ouvindo na porta ' + PORT));
