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

if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
  console.error('\n[ERRO] Defina VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY.');
  console.error('Gere com:  npm run gen-keys\n');
  process.exit(1);
}
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

/* ---- persistência simples em arquivo ---- */
let subs = []; // { id, team, name, subscription, createdAt }
function load() {
  try { subs = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')) || []; }
  catch (e) { subs = []; }
}
function persist() {
  try { fs.writeFileSync(STORE_FILE, JSON.stringify(subs)); }
  catch (e) { console.error('Falha ao gravar store:', e.message); }
}
load();

const app = express();
app.use(cors());
app.use(express.json({ limit: '64kb' }));

app.get('/health', (req, res) => res.json({ ok: true, subscriptions: subs.length }));

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

// Dispara o Código Azul para todos os membros da equipe.
app.post('/page', async (req, res) => {
  const { team, by, roles, message } = req.body || {};
  if (!team) return res.status(400).json({ error: 'team obrigatório' });
  const targets = subs.filter((s) => s.team === String(team));
  const payload = JSON.stringify({
    title: '🔵 CÓDIGO AZUL',
    body: message || ('Acionamento da equipe' + (by ? ' — por ' + by : '')),
    team: String(team),
    roles: Array.isArray(roles) ? roles : [],
    ts: Date.now()
  });
  const stale = [];
  const results = await Promise.all(targets.map((s) =>
    webpush.sendNotification(s.subscription, payload)
      .then(() => true)
      .catch((err) => {
        // 404/410: inscrição expirada → remover
        if (err && (err.statusCode === 404 || err.statusCode === 410)) stale.push(s.subscription.endpoint);
        return false;
      })
  ));
  if (stale.length) { subs = subs.filter((s) => stale.indexOf(s.subscription.endpoint) === -1); persist(); }
  const sent = results.filter(Boolean).length;
  res.json({ ok: true, team: String(team), targets: targets.length, sent, removedStale: stale.length });
});

app.listen(PORT, () => console.log('pcr-pager-server ouvindo na porta ' + PORT));
