/* =========================================================================
 * Manejo de PCR — copiloto clínico. Lógica do app (vanilla JS, offline-first).
 * Estado persistido a cada evento em localStorage → recuperação após crash.
 * ========================================================================= */
(function () {
  'use strict';
  var D = window.PCR_DATA;
  var SESSION_KEY = 'pcr_session_v1';
  var HISTORY_KEY = 'pcr_history_v1';
  var $ = function (id) { return document.getElementById(id); };

  /* ---------------- Estado ---------------- */
  var state = null;       // sessão ativa
  var ticker = null;      // setInterval
  var audioCtx = null;
  var wakeLock = null;

  function blankState() {
    return {
      id: 'pcr_' + Date.now(),
      startTime: Date.now(),
      ended: false,
      muted: false,
      rhythm: null,           // 'FV/TV' | 'AESP' | 'Assistolia'
      shockable: false,
      events: [],             // {t, type, label, meta}
      cycleStart: Date.now(), // início do ciclo de 2 min atual
      lastEpi: null,          // timestamp da última adrenalina
      // compressões / fração de compressão
      compRunning: true,
      pauses: [],             // {start, end}
      // causas reversíveis
      causes: {},             // id -> 'considered'|'discarded'|'treating'
      // bundle pós-parada
      bundle: {},             // id -> true
      rosc: false,
      roscTime: null,
      // decisão de término
      term: { shockable: null, pocus: null, etco2: '' },
      // metrônomo de compressões (liga automaticamente ao iniciar o código)
      metronome: { on: true, bpm: 110 },
      // alertas já disparados (para não repetir beep/voz)
      flags: { cycleOver: false, epiDue: false, causeNudge: 0, chargeSaid: false }
    };
  }

  /* ---------------- Persistência ---------------- */
  function save() {
    if (!state) return;
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(state)); } catch (e) {}
  }
  function loadSaved() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (e) { return null; }
  }
  function clearSaved() { try { localStorage.removeItem(SESSION_KEY); } catch (e) {} }

  function loadHistory() { try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch (e) { return []; } }
  function saveHistory(l) { try { localStorage.setItem(HISTORY_KEY, JSON.stringify(l)); } catch (e) {} }

  /* ---------------- Áudio (WebAudio, sem assets) ---------------- */
  function ensureAudio() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) {}
  }
  function beep(freq, dur, vol) {
    if (!state || state.muted || !audioCtx) return;
    try {
      var o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = freq || 880;
      g.gain.value = vol || 0.18;
      o.connect(g); g.connect(audioCtx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + (dur || 0.2));
      o.stop(audioCtx.currentTime + (dur || 0.2));
    } catch (e) {}
  }
  function alertBeep() { beep(988, 0.18); setTimeout(function () { beep(988, 0.18); }, 230); }
  function vibrate(ms) { if (navigator.vibrate) try { navigator.vibrate(ms); } catch (e) {} }

  /* ---------------- Metrônomo de compressões (WebAudio, lookahead) ---------------- */
  var metroTimer = null;
  var nextClickTime = 0;
  function startMetro() {
    ensureAudio();
    if (!audioCtx) return;
    state.metronome.on = true;
    nextClickTime = audioCtx.currentTime + 0.06;
    if (metroTimer) clearInterval(metroTimer);
    metroTimer = setInterval(metroScheduler, 25);
    renderMetro(); save();
  }
  function stopMetro() {
    if (state) state.metronome.on = false;
    if (metroTimer) { clearInterval(metroTimer); metroTimer = null; }
    renderMetro(); if (state) save();
  }
  function metroScheduler() {
    if (!audioCtx || !state || !state.metronome.on) return;
    var interval = 60 / state.metronome.bpm; // segundos entre compressões
    while (nextClickTime < audioCtx.currentTime + 0.1) {
      metroClick(nextClickTime);
      nextClickTime += interval;
    }
  }
  function metroClick(t) {
    try {
      var o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'square'; o.frequency.value = 1000;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.4, t + 0.001);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t); o.stop(t + 0.06);
    } catch (e) {}
  }
  function setBpm(v) {
    if (!state) return;
    v = Math.max(100, Math.min(120, Math.round(v)));
    state.metronome.bpm = v;
    renderMetro(); save();
  }
  function renderMetro() {
    var b = $('metroBtn');
    if (!b || !state) return;
    b.classList.toggle('on', !!state.metronome.on);
    b.querySelector('.mlabel').textContent = state.metronome.on ? '⏸ Metrônomo' : '▶ Metrônomo';
    $('metroState').textContent = state.metronome.bpm + '/min';
  }

  /* ---------------- Voz firme (Web Speech, pt-BR) ---------------- */
  var ptVoice = null;
  function pickVoice() {
    if (!('speechSynthesis' in window)) return null;
    if (ptVoice) return ptVoice;
    try {
      var vs = window.speechSynthesis.getVoices() || [];
      ptVoice = vs.filter(function (v) { return /pt[-_]?br/i.test(v.lang); })[0]
        || vs.filter(function (v) { return /^pt/i.test(v.lang); })[0] || null;
    } catch (e) {}
    return ptVoice;
  }
  if ('speechSynthesis' in window) {
    try { window.speechSynthesis.onvoiceschanged = function () { ptVoice = null; pickVoice(); }; } catch (e) {}
  }
  function speak(text) {
    if (!state || state.muted) return;
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'pt-BR'; u.rate = 1.0; u.pitch = 0.8; u.volume = 1; // tom firme/grave
      var v = pickVoice(); if (v) u.voice = v;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }
  function warmSpeech() {
    // Libera a síntese de voz dentro do gesto do usuário (necessário no iOS)
    if (!('speechSynthesis' in window)) return;
    try { var u = new SpeechSynthesisUtterance(' '); u.volume = 0; u.lang = 'pt-BR'; window.speechSynthesis.speak(u); } catch (e) {}
    pickVoice();
  }
  function migrateState() {
    if (!state.metronome) state.metronome = { on: true, bpm: 110 };
    if (!state.flags) state.flags = { cycleOver: false, epiDue: false, causeNudge: 0, chargeSaid: false };
    if (typeof state.flags.chargeSaid === 'undefined') state.flags.chargeSaid = false;
  }

  /* ---------------- Equipe do plantão (check-in + designação de funções) ---------------- */
  var TEAM_KEY = 'pcr_team_v1';
  var ROLES = [
    { id: 'lider', name: 'Líder' },
    { id: 'viaAerea', name: 'Via Aérea' },
    { id: 'comp1', name: 'Compressão - 1º' },
    { id: 'comp2', name: 'Compressão - 2º' },
    { id: 'monitor', name: 'Monitorização/Desfibrilação' },
    { id: 'medicacao', name: 'Medicamentos' }
  ];
  var team = null;
  function todayStr() { var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  function defaultTeam() { return { shiftDate: todayStr(), members: [], roles: {} }; }
  function loadTeam() { try { return JSON.parse(localStorage.getItem(TEAM_KEY)) || defaultTeam(); } catch (e) { return defaultTeam(); } }
  function saveTeam() { try { localStorage.setItem(TEAM_KEY, JSON.stringify(team)); } catch (e) {} }
  function memberName(id) { var m = (team.members || []).filter(function (x) { return x.id === id; })[0]; return m ? m.name : null; }
  function rolesCountFor(id) { var n = 0; ROLES.forEach(function (r) { if (team.roles[r.id] === id) n++; }); return n; }

  function openTeam() {
    team = loadTeam();
    $('shiftDate').value = team.shiftDate || todayStr();
    renderMembers(); renderRoles();
    $('teamDialog').showModal();
  }
  function renderMembers() {
    var ul = $('memberList'); ul.innerHTML = '';
    if (!team.members.length) { ul.innerHTML = '<li class="member-empty">Nenhum membro fez check-in ainda.</li>'; return; }
    team.members.forEach(function (m) {
      var assigned = ROLES.filter(function (r) { return team.roles[r.id] === m.id; }).map(function (r) { return r.name; });
      var li = document.createElement('li');
      li.innerHTML = '<span class="m-name">' + escapeHtml(m.name) + '</span>'
        + '<span class="m-roles">' + escapeHtml(assigned.join(', ')) + '</span>'
        + '<button class="m-rm" aria-label="Remover">✕</button>';
      li.querySelector('.m-rm').onclick = function () {
        team.members = team.members.filter(function (x) { return x.id !== m.id; });
        ROLES.forEach(function (r) { if (team.roles[r.id] === m.id) delete team.roles[r.id]; });
        saveTeam(); renderMembers(); renderRoles();
      };
      ul.appendChild(li);
    });
  }
  function addMember() {
    var name = $('memberName').value.trim();
    if (!name) return;
    team.members.push({ id: 'm' + Date.now() + Math.floor(Math.random() * 1000), name: name, checkedInAt: Date.now() });
    $('memberName').value = '';
    saveTeam(); renderMembers(); renderRoles();
  }
  function renderRoles() {
    var wrap = $('roleAssign'); wrap.innerHTML = '';
    ROLES.forEach(function (r) {
      var row = document.createElement('div'); row.className = 'role-row';
      var opts = '<option value="">—</option>' + team.members.map(function (m) {
        return '<option value="' + m.id + '"' + (team.roles[r.id] === m.id ? ' selected' : '') + '>' + escapeHtml(m.name) + '</option>';
      }).join('');
      row.innerHTML = '<span class="r-name">' + r.name + '</span><select data-role="' + r.id + '">' + opts + '</select>';
      var s = row.querySelector('select');
      s.onchange = function () {
        var v = s.value;
        if (v && team.roles[r.id] !== v && rolesCountFor(v) >= 2) {
          alert(memberName(v) + ' já está em 2 funções. Um membro pode acumular no máximo 2.');
          s.value = team.roles[r.id] || '';
          return;
        }
        if (v) team.roles[r.id] = v; else delete team.roles[r.id];
        saveTeam(); renderMembers();
      };
      wrap.appendChild(row);
    });
  }

  /* ---------------- Pager Web Push (opcional, online) ---------------- */
  var PAGER_KEY = 'pcr_pager_v1';
  function loadPager() { try { return JSON.parse(localStorage.getItem(PAGER_KEY)) || {}; } catch (e) { return {}; } }
  function savePager(p) { try { localStorage.setItem(PAGER_KEY, JSON.stringify(p)); } catch (e) {} }
  function urlB64ToUint8(base64) {
    var padding = '='.repeat((4 - base64.length % 4) % 4);
    var b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(b64), arr = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }
  function openPager() {
    var p = loadPager();
    $('pagerUrl').value = p.url || '';
    $('pagerTeam').value = p.team || '';
    $('pagerName').value = p.name || '';
    $('pagerStatus').textContent = p.enabled ? 'Pager ativado neste aparelho ✓ (equipe: ' + (p.team || '') + ')' : 'Pager não ativado neste aparelho.';
    $('pagerDialog').showModal();
  }
  function enablePager() {
    var url = ($('pagerUrl').value || '').trim().replace(/\/+$/, '');
    var teamName = ($('pagerTeam').value || '').trim();
    var name = ($('pagerName').value || '').trim();
    if (!url || !teamName) { $('pagerStatus').textContent = 'Informe a URL do servidor e a equipe/unidade.'; return; }
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      $('pagerStatus').textContent = 'Este navegador não suporta Web Push.'; return;
    }
    $('pagerStatus').textContent = 'Ativando…';
    Notification.requestPermission().then(function (perm) {
      if (perm !== 'granted') { $('pagerStatus').textContent = 'Permissão de notificação negada.'; return; }
      return navigator.serviceWorker.ready.then(function (reg) {
        return fetch(url + '/vapidPublicKey').then(function (r) { return r.text(); }).then(function (pub) {
          return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(pub.trim()) });
        }).then(function (sub) {
          return fetch(url + '/subscribe', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ team: teamName, name: name, subscription: sub })
          });
        }).then(function () {
          savePager({ url: url, team: teamName, name: name, enabled: true });
          $('pagerStatus').textContent = 'Pager ativado neste aparelho ✓';
        });
      });
    }).catch(function (e) { $('pagerStatus').textContent = 'Falha ao ativar: ' + (e && e.message ? e.message : e); });
  }
  // Dispara o Código Azul para a equipe (não bloqueia o fluxo local).
  function triggerPager() {
    var p = loadPager();
    if (!p.url || !p.team) return;
    var tm = loadTeam();
    var roles = ROLES.filter(function (r) { return tm.roles[r.id]; })
      .map(function (r) { return r.name + ': ' + (memberNameIn(tm, tm.roles[r.id]) || '—'); });
    try {
      fetch(p.url + '/page', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team: p.team, by: p.name || '', roles: roles })
      }).catch(function () {});
    } catch (e) {}
  }

  /* ---------------- Código Azul — alarme de acionamento (alto volume) ---------------- */
  var blueTimer = null;
  function sirenTone(t, freq, dur) {
    try {
      var o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.85, t + 0.04);
      g.gain.setValueAtTime(0.85, t + dur - 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) {}
  }
  function siren() {
    if (!audioCtx) return;
    var t = audioCtx.currentTime;
    sirenTone(t, 740, 0.4); sirenTone(t + 0.45, 1100, 0.4);
    vibrate([300, 120, 300]);
  }
  function startBlueAlarm() {
    ensureAudio();
    if (!audioCtx || blueTimer) return;
    siren();
    blueTimer = setInterval(siren, 1100);
  }
  function stopBlueAlarm() { if (blueTimer) { clearInterval(blueTimer); blueTimer = null; } }
  function renderBaRoles() {
    var t = loadTeam();
    var present = (t.members || []).length;
    var html = ROLES.map(function (r) {
      var nm = (t.roles[r.id] && memberNameIn(t, t.roles[r.id])) || '—';
      return '<div class="bar"><span class="bn">' + r.name + '</span><b>' + escapeHtml(nm) + '</b></div>';
    }).join('');
    $('baRoles').innerHTML = (present ? '' : '<div class="bar"><span class="bn">Nenhum membro em check-in</span><b>—</b></div>') + html;
  }
  function memberNameIn(t, id) { var m = (t.members || []).filter(function (x) { return x.id === id; })[0]; return m ? m.name : null; }
  function showBlueOverlay() { renderBaRoles(); $('blueAlert').classList.add('show'); }
  function hideBlueOverlay() { $('blueAlert').classList.remove('show'); }
  var pendingMetro = false;

  /* ---------------- Wake lock (manter tela ligada) ---------------- */
  function requestWake() {
    if (!('wakeLock' in navigator)) return;
    navigator.wakeLock.request('screen').then(function (w) { wakeLock = w; }).catch(function () {});
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && state && !state.ended) requestWake();
  });

  /* ---------------- Formatação de tempo ---------------- */
  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function fmtSigned(sec) { return (sec < 0 ? '+' : '') + fmt(Math.abs(sec)); }
  function totalSec() { return state ? (Date.now() - state.startTime) / 1000 : 0; }

  function pausedSeconds() {
    var sum = 0;
    state.pauses.forEach(function (p) { sum += ((p.end || Date.now()) - p.start) / 1000; });
    return sum;
  }
  function ccf() {
    var t = totalSec();
    if (t <= 0) return null;
    var comp = t - pausedSeconds();
    return Math.max(0, Math.min(100, (comp / t) * 100));
  }

  /* ---------------- Registro de eventos ---------------- */
  function logEvent(type, label, meta) {
    state.events.push({ t: Date.now(), type: type, label: label, meta: meta || null });
    save();
    renderTimeline();
    renderCode();
  }

  /* ---------------- Início / recuperação ---------------- */
  function startCode(recovered, deferMetro) {
    if (!recovered) state = blankState();
    migrateState();
    $('startScreen').classList.add('hidden');
    $('app').style.display = 'flex';
    ensureAudio();
    requestWake();
    buildStaticUI();
    if (!ticker) ticker = setInterval(tick, 250);
    // metrônomo: liga automaticamente; quando há Código Azul, adia até entrar no código
    if (deferMetro) {
      pendingMetro = !!state.metronome.on;
      state.metronome.on = false; renderMetro();
    } else if (state.metronome.on) {
      state.metronome.on = false; startMetro();
    } else { renderMetro(); }
    tick();
    save();
  }

  function showStartScreen() {
    $('app').style.display = 'none';
    $('startScreen').classList.remove('hidden');
    var saved = loadSaved();
    var holder = $('recoverHolder');
    holder.innerHTML = '';
    if (saved && !saved.ended) {
      var mins = Math.floor((Date.now() - saved.startTime) / 60000);
      var card = document.createElement('div');
      card.className = 'recover-card';
      card.innerHTML = '<div class="rc-title">⚠️ Código em andamento recuperável</div>'
        + '<div>Iniciado há ' + mins + ' min, ' + saved.events.length + ' eventos registrados. Recuperar a sessão?</div>'
        + '<div class="rc-row" style="margin-top:10px"><button class="rc-recover" id="rcRecover">Recuperar</button>'
        + '<button class="rc-discard" id="rcDiscard">Descartar</button></div>';
      holder.appendChild(card);
      $('rcRecover').onclick = function () { state = saved; startCode(true); };
      $('rcDiscard').onclick = function () { if (confirm('Descartar o código em andamento? Esta ação não pode ser desfeita.')) { clearSaved(); showStartScreen(); } };
    }
  }

  /* ---------------- Loop principal (timers + alertas) ---------------- */
  function tick() {
    if (!state || state.ended) return;
    var t = totalSec();
    $('tTotal').textContent = fmt(t);

    // Ciclo de 2 min
    var cycleEl = (Date.now() - state.cycleStart) / 1000;
    var cycleRem = D.cycleSec - cycleEl;
    var cycleTmr = $('cycleTmr');
    $('tCycle').textContent = fmtSigned(cycleRem);
    cycleTmr.classList.toggle('over', cycleRem <= 0);
    cycleTmr.classList.toggle('alert', cycleRem > 0 && cycleRem <= 15);
    if (cycleRem <= 0 && !state.flags.cycleOver) { state.flags.cycleOver = true; alertBeep(); vibrate([120, 60, 120]); }
    if (cycleRem > 0) state.flags.cycleOver = false;

    // Voz firme: "Carregue as pás" 15 s antes do fim do ciclo (para checagem do ritmo)
    if (state.rhythm && cycleRem <= 15 && cycleRem > 0 && !state.flags.chargeSaid) {
      state.flags.chargeSaid = true;
      speak('Carregue as pás');
    }
    if (cycleRem > 16) state.flags.chargeSaid = false;

    // Adrenalina
    var epiTmr = $('epiTmr');
    if (state.lastEpi === null) {
      $('tEpi').textContent = '--';
      epiTmr.classList.remove('alert', 'over');
    } else {
      var epiEl = (Date.now() - state.lastEpi) / 1000;
      $('tEpi').textContent = fmt(epiEl);
      var due = epiEl >= D.epiIntervalSec;
      epiTmr.classList.toggle('over', due);
      epiTmr.classList.toggle('alert', !due && epiEl >= D.epiIntervalSec - 30);
      if (due && !state.flags.epiDue) { state.flags.epiDue = true; alertBeep(); vibrate([120, 60, 120]); }
      if (!due) state.flags.epiDue = false;
    }

    // CCF
    var c = ccf();
    var ccfEl = $('ccfVal');
    if (c === null) { ccfEl.textContent = '--'; }
    else {
      ccfEl.textContent = Math.round(c) + '%';
      ccfEl.className = 'tv ' + (c >= 80 ? 'ccf-good' : 'ccf-bad');
    }

    // Cobrança de causas reversíveis (nudge)
    var anyCause = Object.keys(state.causes).length > 0;
    var nudgeLevel = Math.floor(t / D.causeNudgeSec);
    if (!anyCause && nudgeLevel >= 1 && nudgeLevel > state.flags.causeNudge) {
      state.flags.causeNudge = nudgeLevel;
      alertBeep(); vibrate([200]);
    }

    updatePush(cycleRem, anyCause, t);
    updateCausesBadge(anyCause, t);
    if ($('sharedScreen').classList.contains('show')) renderShared(cycleRem, t, c);
    if (currentView === 'term') renderTermSummary();
    save();
  }

  function updatePush(cycleRem, anyCause, t) {
    var el = $('pushBanner');
    var cls = 'push', html;
    if (!state.rhythm) {
      html = 'Selecione o ritmo e inicie as compressões.';
    } else if (cycleRem <= 0) {
      cls += ' urgent';
      html = '⏱️ FIM DO CICLO — CHECAR RITMO / PULSO<small>minimize a pausa: ≤ 10 s</small>';
    } else if (state.lastEpi !== null && (Date.now() - state.lastEpi) / 1000 >= D.epiIntervalSec) {
      cls += ' epi';
      html = '💉 ADRENALINA DISPONÍVEL<small>1 mg IV/IO — a cada 3–5 min</small>';
    } else if (state.shockable) {
      html = '⚡ Ritmo chocável — desfibrilar, RCP 2 min, adrenalina + antiarrítmico<small>checar pulso ao fim do ciclo</small>';
    } else if (state.rhythm) {
      html = '🔁 Não-chocável — RCP, adrenalina o quanto antes, buscar causa<small>5H e 5T</small>';
    }
    if (!anyCause && t >= D.causeNudgeSec) {
      cls = 'push nudge';
      html = '🔎 ' + Math.floor(t / 60) + ' min de parada — nenhuma causa reversível trabalhada.<small>Considere os 5H e 5T (aba Causas)</small>';
    }
    el.className = cls; el.innerHTML = html;
  }

  function updateCausesBadge(anyCause, t) {
    var b = $('causesBadge');
    if (!anyCause && t >= D.causeNudgeSec) { b.classList.add('show'); b.setAttribute('data-badge', '!'); }
    else b.classList.remove('show');
  }

  /* ---------------- View / navegação ---------------- */
  var currentView = 'code';
  function showView(v) {
    currentView = v;
    document.querySelectorAll('.view').forEach(function (s) { s.classList.toggle('active', s.getAttribute('data-view') === v); });
    document.querySelectorAll('.bottom-nav button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-nav') === v); });
    if (v === 'timeline') renderTimeline();
    if (v === 'term') renderTermSummary();
  }

  /* ---------------- Render: tela Código ---------------- */
  function renderCode() {
    // ritmo
    document.querySelectorAll('.rhythm-grid button').forEach(function (b) {
      var sel = b.getAttribute('data-rhythm') === state.rhythm;
      b.classList.toggle('sel-shock', sel && b.getAttribute('data-shock') === '1');
      b.classList.toggle('sel-nonshock', sel && b.getAttribute('data-shock') === '0');
    });
    var pill = $('rhythmPill');
    if (state.rhythm) {
      pill.textContent = 'Ritmo: ' + state.rhythm;
      pill.className = 'rhythm-pill ' + (state.shockable ? 'shock' : 'nonshock');
    } else { pill.textContent = 'Ritmo: definir'; pill.className = 'rhythm-pill'; }

    // contadores
    var shocks = state.events.filter(function (e) { return e.type === 'shock'; }).length;
    var epis = state.events.filter(function (e) { return e.type === 'epi'; }).length;
    $('shockCount').textContent = shocks + (shocks === 1 ? ' administrado' : ' administrados');
    $('epiCount').textContent = epis + (epis === 1 ? ' dose' : ' doses');

    // compressões
    var cb = $('compBtn');
    cb.classList.toggle('paused', !state.compRunning);
    $('compState').textContent = state.compRunning ? 'em andamento' : 'PAUSADAS — retomar';
  }

  /* ---------------- Render: linha do tempo ---------------- */
  var EV_ICON = { rhythm: '💓', shock: '⚡', epi: '💉', antiarr: '💊', pulse: '🫀', airway: '🌬️',
    access: '🩸', comment: '📝', rosc: '💚', pause: '⏸️', resume: '▶️', cause: '🔎', bundle: '✅', term: '⚖️' };
  function renderTimeline() {
    var el = $('fullTimeline');
    if (!el) return;
    if (!state.events.length) { el.innerHTML = '<div class="tl-empty">Nenhum evento registrado ainda.</div>'; return; }
    var html = '';
    for (var i = state.events.length - 1; i >= 0; i--) {
      var e = state.events[i];
      var off = (e.t - state.startTime) / 1000;
      html += '<div class="tl-item"><div class="tl-t">' + fmt(off) + '</div>'
        + '<div class="tl-x">' + (EV_ICON[e.type] || '•') + '</div>'
        + '<div class="tl-d">' + escapeHtml(e.label) + (e.meta ? ' <small>' + escapeHtml(e.meta) + '</small>' : '') + '</div></div>';
    }
    el.innerHTML = html;
  }
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

  /* ---------------- Ações de registro ---------------- */
  function doAction(act) {
    ensureAudio();
    vibrate(15);
    switch (act) {
      case 'shock':
        logEvent('shock', 'Choque / desfibrilação');
        beep(660, 0.12);
        break;
      case 'epi':
        state.lastEpi = Date.now();
        state.flags.epiDue = false;
        logEvent('epi', 'Adrenalina 1 mg IV/IO');
        break;
      case 'antiarr':
        openMeta('Antiarrítmico', [
          { label: 'Amiodarona 300 mg', cb: function () { logEvent('antiarr', 'Amiodarona 300 mg IV/IO', '1ª dose'); } },
          { label: 'Amiodarona 150 mg', cb: function () { logEvent('antiarr', 'Amiodarona 150 mg IV/IO', '2ª dose'); } },
          { label: 'Lidocaína 1–1,5 mg/kg', cb: function () { logEvent('antiarr', 'Lidocaína 1–1,5 mg/kg IV/IO'); } }
        ], 'Indicado em FV/TV refratária ao choque.');
        break;
      case 'pulse':
        openMeta('Checagem de pulso / ritmo', [
          { label: 'Sem pulso — manter RCP', cb: function () { logEvent('pulse', 'Checagem de pulso: SEM pulso', 'manter RCP'); newCycle(); } },
          { label: 'Com pulso — RCE!', cb: function () { logEvent('pulse', 'Checagem de pulso: COM pulso', 'avaliar RCE'); markRosc(); } }
        ], 'Limite a pausa a ≤ 10 s. Inicia novo ciclo de 2 min.');
        break;
      case 'airway':
        openMeta('Via aérea', [
          { label: 'Intubação orotraqueal (IOT)', cb: function () { logEvent('airway', 'Via aérea: IOT'); } },
          { label: 'Dispositivo supraglótico', cb: function () { logEvent('airway', 'Via aérea: supraglótico'); } },
          { label: 'Bolsa-válvula-máscara', cb: function () { logEvent('airway', 'Via aérea: BVM'); } }
        ]);
        break;
      case 'access':
        openMeta('Acesso', [
          { label: 'Acesso venoso periférico', cb: function () { logEvent('access', 'Acesso: venoso'); } },
          { label: 'Acesso intraósseo (IO)', cb: function () { logEvent('access', 'Acesso: intraósseo'); } },
          { label: 'Acesso venoso central', cb: function () { logEvent('access', 'Acesso: venoso central'); } }
        ]);
        break;
      case 'comment':
        $('commentText').value = '';
        $('commentDialog').showModal();
        break;
      case 'undo':
        if (state.events.length && confirm('Desfazer o último evento registrado?')) {
          var last = state.events.pop();
          if (last.type === 'epi') {
            var lastEpiEv = state.events.filter(function (e) { return e.type === 'epi'; }).pop();
            state.lastEpi = lastEpiEv ? lastEpiEv.t : null;
          }
          save(); renderTimeline(); renderCode();
        }
        break;
    }
  }

  function newCycle() { state.cycleStart = Date.now(); state.flags.cycleOver = false; state.flags.chargeSaid = false; save(); }

  function setRhythm(r, shockable) {
    state.rhythm = r; state.shockable = shockable;
    logEvent('rhythm', 'Ritmo: ' + r, shockable ? 'chocável' : 'não-chocável');
    if (state.events.filter(function (e) { return e.type === 'rhythm'; }).length === 1) newCycle();
  }

  function toggleComp() {
    vibrate(15);
    if (state.compRunning) {
      state.compRunning = false;
      state.pauses.push({ start: Date.now(), end: null });
      logEvent('pause', 'Compressões pausadas');
    } else {
      state.compRunning = true;
      var open = state.pauses[state.pauses.length - 1];
      if (open && open.end === null) open.end = Date.now();
      logEvent('resume', 'Compressões retomadas');
    }
    renderCode();
  }

  /* ---------------- Meta dialog (escolha rápida) ---------------- */
  function openMeta(title, options, note) {
    $('metaTitle').textContent = title;
    $('metaBody').innerHTML = note ? '<p style="color:var(--muted);font-size:.82rem">' + note + '</p>' : '';
    var act = $('metaActions');
    act.innerHTML = '';
    act.style.flexDirection = 'column';
    options.forEach(function (o) {
      var b = document.createElement('button');
      b.className = 'btn-ghost'; b.textContent = o.label; b.style.width = '100%';
      b.onclick = function () { $('metaDialog').close(); o.cb(); };
      act.appendChild(b);
    });
    var c = document.createElement('button');
    c.className = 'btn-primary'; c.textContent = 'Cancelar'; c.style.width = '100%';
    c.onclick = function () { $('metaDialog').close(); };
    act.appendChild(c);
    $('metaDialog').showModal();
  }

  /* ---------------- RCE ---------------- */
  function markRosc() {
    if (!state.rosc) {
      state.rosc = true; state.roscTime = Date.now();
      logEvent('rosc', 'RCE — retorno da circulação espontânea');
    }
    beep(523, 0.15); setTimeout(function () { beep(784, 0.25); }, 160);
    showView('post');
  }

  /* ---------------- Causas (5H 5T) ---------------- */
  function buildCauses() {
    var wrap = $('causesList'); wrap.innerHTML = '';
    D.causes.forEach(function (c) {
      var st = state.causes[c.id] || null;
      var el = document.createElement('div');
      el.className = 'chk';
      el.innerHTML =
        '<div class="chk-head"><div class="ck-letter">' + c.letter + '</div>'
        + '<div class="ck-name">' + c.name + '<small>' + c.hint + '</small></div>'
        + '<div class="ck-status ' + (st || '') + '">' + statusLabel(st) + '</div></div>'
        + '<div class="chk-body"><div class="conduct">' + c.conduct + '</div>'
        + '<div class="seg" data-cause="' + c.id + '">'
        + '<button data-v="considered">Considerada</button>'
        + '<button data-v="discarded">Descartada</button>'
        + '<button data-v="treating">Em tratamento</button></div></div>';
      wrap.appendChild(el);
      el.querySelector('.chk-head').onclick = function (e) {
        if (e.target.closest('.seg')) return;
        el.classList.toggle('open');
      };
      el.querySelectorAll('.seg button').forEach(function (b) {
        var v = b.getAttribute('data-v');
        b.classList.toggle('on-' + v, st === v);
        b.onclick = function () {
          var newv = (state.causes[c.id] === v) ? null : v;
          if (newv) state.causes[c.id] = newv; else delete state.causes[c.id];
          logEvent('cause', c.name + ': ' + (newv ? statusLabel(newv) : 'reaberta'));
          buildCauses();
        };
      });
    });
  }
  function statusLabel(s) {
    return s === 'considered' ? 'Considerada' : s === 'discarded' ? 'Descartada' : s === 'treating' ? 'Em tratamento' : 'Pendente';
  }

  /* ---------------- Especiais ---------------- */
  function buildSpecial() {
    var wrap = $('specialList'); wrap.innerHTML = '';
    D.special.forEach(function (s) {
      var b = document.createElement('button');
      b.innerHTML = s.title + '<small>' + s.sub + '</small>';
      b.onclick = function () {
        $('spTitle').textContent = s.title;
        $('spBody').innerHTML = s.body;
        $('specialDialog').showModal();
      };
      wrap.appendChild(b);
    });
  }

  /* ---------------- Bundle pós-parada ---------------- */
  function buildBundle() {
    var wrap = $('bundleList'); wrap.innerHTML = '';
    D.bundle.forEach(function (item) {
      var done = !!state.bundle[item.id];
      var el = document.createElement('div');
      el.className = 'bundle-item' + (done ? ' done' : '');
      el.innerHTML = '<div class="bx">' + (done ? '✓' : '') + '</div>'
        + '<div class="bt">' + item.title + '<small>' + item.sub + '</small></div>';
      el.onclick = function () {
        if (state.bundle[item.id]) delete state.bundle[item.id];
        else { state.bundle[item.id] = true; logEvent('bundle', 'Pós-RCE: ' + item.title); }
        save(); buildBundle();
      };
      wrap.appendChild(el);
    });
  }

  /* ---------------- Cálculo de infusões ---------------- */
  function setupInfusions() {
    // presets
    var np = $('noraPresets');
    D.noraPresets.forEach(function (p) {
      var b = document.createElement('button'); b.textContent = p.label;
      b.onclick = function () { $('noraMass').value = p.mass; $('noraVol').value = p.vol; calcNora(); };
      np.appendChild(b);
    });
    var ap = $('amioPresets');
    D.amioPresets.forEach(function (p) {
      var b = document.createElement('button'); b.textContent = p.label;
      b.onclick = function () { $('amioMass').value = p.mass; $('amioVol').value = p.vol; calcAmio(); };
      ap.appendChild(b);
    });
    ['noraMass', 'noraVol', 'noraWeight', 'noraDose'].forEach(function (id) { $(id).addEventListener('input', calcNora); });
    ['amioMass', 'amioVol', 'amioDose'].forEach(function (id) { $(id).addEventListener('input', calcAmio); });
  }

  function num(id) { var v = parseFloat($(id).value); return isFinite(v) ? v : null; }

  function calcNora() {
    var mass = num('noraMass'), vol = num('noraVol'), w = num('noraWeight'), dose = num('noraDose');
    var box = $('noraResult'), warnEl = $('noraWarn'), concEl = $('noraConc');
    warnEl.innerHTML = ''; box.classList.remove('warn');
    if (mass === null || vol === null || vol <= 0) { $('noraRate').textContent = '--'; concEl.textContent = ''; return; }
    var conc = mass * 1000 / vol; // mcg/mL
    concEl.textContent = 'Concentração: ' + round(conc, 1) + ' mcg/mL  (' + mass + ' mg em ' + vol + ' mL)';
    // checagem de concentração
    if (conc < D.noraConcRange.min || conc > D.noraConcRange.max) {
      box.classList.add('warn');
      warnEl.innerHTML = '<div class="warn-msg">⚠️ Concentração fora da faixa usual (' + D.noraConcRange.min + '–' + D.noraConcRange.max + ' mcg/mL). Confira a diluição.</div>';
    } else {
      warnEl.innerHTML = '<div class="ok-msg">✓ Concentração dentro da faixa usual.</div>';
    }
    if (w === null || dose === null || w <= 0 || dose < 0) { $('noraRate').textContent = '--'; return; }
    var rate = (dose * w * 60) / conc; // mL/h
    $('noraRate').textContent = round(rate, 1);
  }

  function calcAmio() {
    var mass = num('amioMass'), vol = num('amioVol'), dose = num('amioDose');
    var box = $('amioResult'), warnEl = $('amioWarn'), concEl = $('amioConc');
    warnEl.innerHTML = ''; box.classList.remove('warn');
    if (mass === null || vol === null || vol <= 0) { $('amioRate').textContent = '--'; concEl.textContent = ''; return; }
    var conc = mass / vol; // mg/mL
    concEl.textContent = 'Concentração: ' + round(conc, 2) + ' mg/mL  (' + mass + ' mg em ' + vol + ' mL)';
    if (conc < D.amioConcRange.min || conc > D.amioConcRange.max) {
      box.classList.add('warn');
      warnEl.innerHTML = '<div class="warn-msg">⚠️ Concentração fora da faixa usual (' + D.amioConcRange.min + '–' + D.amioConcRange.max + ' mg/mL). Confira a diluição.</div>';
    } else {
      warnEl.innerHTML = '<div class="ok-msg">✓ Concentração dentro da faixa usual.</div>';
    }
    if (dose === null || dose < 0) { $('amioRate').textContent = '--'; return; }
    var rate = (dose * 60) / conc; // mL/h
    $('amioRate').textContent = round(rate, 1);
  }
  function round(n, d) { var f = Math.pow(10, d); return Math.round(n * f) / f; }

  /* ---------------- Decisão de término ---------------- */
  function setupTerm() {
    document.querySelectorAll('.toggle-2').forEach(function (g) {
      var key = g.getAttribute('data-term');
      g.querySelectorAll('button').forEach(function (b) {
        b.onclick = function () {
          var v = b.getAttribute('data-v');
          state.term[key] = (state.term[key] === v) ? null : v;
          renderTermToggles(); renderTermSummary(); save();
        };
      });
    });
    $('termEtco2').addEventListener('input', function () { state.term.etco2 = $('termEtco2').value; renderTermSummary(); save(); });
  }
  function renderTermToggles() {
    document.querySelectorAll('.toggle-2').forEach(function (g) {
      var key = g.getAttribute('data-term');
      g.querySelectorAll('button').forEach(function (b) {
        var v = b.getAttribute('data-v');
        b.classList.toggle('on-yes', state.term[key] === v && v === 'yes');
        b.classList.toggle('on-no', state.term[key] === v && v === 'no');
      });
    });
  }
  function renderTermSummary() {
    $('termDuration').textContent = fmt(totalSec());
    if ($('termEtco2') !== document.activeElement) $('termEtco2').value = state.term.etco2 || '';
    var pts = [];
    var durMin = Math.floor(totalSec() / 60);
    pts.push('Duração da parada: <b>' + fmt(totalSec()) + '</b>' + (durMin >= 20 ? ' (≥ 20 min)' : ''));
    if (state.term.shockable === 'no') pts.push('Sem ritmo chocável em nenhum momento recente.');
    if (state.term.shockable === 'yes') pts.push('Houve ritmo chocável — a favor de prosseguir.');
    if (state.term.pocus === 'no') pts.push('POCUS: <b>ausência de contração cardíaca</b>.');
    if (state.term.pocus === 'yes') pts.push('POCUS: contração presente — a favor de prosseguir.');
    var etco2 = parseFloat(state.term.etco2);
    if (isFinite(etco2)) {
      pts.push('EtCO₂ = <b>' + etco2 + ' mmHg</b>' + (etco2 < 10 && durMin >= 20 ? ' (&lt; 10 mmHg após RCP prolongada de qualidade — desfavorável)' : ''));
    }
    var head = 'Âncoras objetivas para a decisão (o app não decide):';
    $('termSummary').innerHTML = '<b>' + head + '</b><ul style="margin:8px 0 0;padding-left:18px">'
      + pts.map(function (p) { return '<li style="margin:4px 0">' + p + '</li>'; }).join('') + '</ul>';
  }

  /* ---------------- Tela compartilhada ---------------- */
  function renderShared(cycleRem, t, c) {
    $('ssRhythm').textContent = state.rhythm || 'DEFINIR RITMO';
    $('ssCycle').textContent = fmtSigned(cycleRem);
    $('sharedScreen').classList.toggle('over', cycleRem <= 0);
    var next;
    if (cycleRem <= 0) next = 'CHECAR PULSO';
    else if (state.lastEpi !== null && (Date.now() - state.lastEpi) / 1000 >= D.epiIntervalSec) next = 'ADRENALINA';
    else next = state.compRunning ? 'COMPRESSÕES' : 'RETOMAR COMPRESSÕES';
    $('ssNext').textContent = next;
    $('ssTotal').textContent = fmt(t);
    $('ssEpi').textContent = state.lastEpi === null ? '--' : fmt((Date.now() - state.lastEpi) / 1000);
    $('ssCcf').textContent = (c === null) ? '--' : Math.round(c) + '%';
    // escalação da equipe (somente funções designadas)
    var tm = loadTeam();
    var assigned = ROLES.filter(function (r) { return tm.roles[r.id]; });
    $('ssTeam').innerHTML = assigned.map(function (r) {
      return '<div class="st">' + r.name + '<b>' + escapeHtml(memberNameIn(tm, tm.roles[r.id]) || '—') + '</b></div>';
    }).join('');
  }
  function toggleShared() {
    var ss = $('sharedScreen');
    var on = !ss.classList.contains('show');
    ss.classList.toggle('show', on);
    $('shareBtn').classList.toggle('active', on);
    if (on) {
      tick();
      if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {});
    } else if (document.fullscreenElement) {
      document.exitFullscreen().catch(function () {});
    }
  }

  /* ---------------- Métricas de qualidade ---------------- */
  function computeMetrics() {
    var ev = state.events;
    var dur = totalSec();
    var firstShock = ev.find(function (e) { return e.type === 'shock'; });
    var firstEpi = ev.find(function (e) { return e.type === 'epi'; });
    var shocks = ev.filter(function (e) { return e.type === 'shock'; }).length;
    var epis = ev.filter(function (e) { return e.type === 'epi'; }).length;
    // pausa peri-choque: maior pausa que se sobrepõe a janela ±10s de um choque
    var periShock = null;
    var shockTimes = ev.filter(function (e) { return e.type === 'shock'; }).map(function (e) { return e.t; });
    if (shockTimes.length && state.pauses.length) {
      var maxOverlap = 0, found = false;
      state.pauses.forEach(function (p) {
        var end = p.end || Date.now();
        shockTimes.forEach(function (st) {
          if (st >= p.start - 10000 && st <= end + 10000) {
            found = true;
            var len = (end - p.start) / 1000;
            if (len > maxOverlap) maxOverlap = len;
          }
        });
      });
      if (found) periShock = maxOverlap;
    }
    return {
      dur: dur,
      ccf: ccf(),
      timeToShock: firstShock ? (firstShock.t - state.startTime) / 1000 : null,
      timeToEpi: firstEpi ? (firstEpi.t - state.startTime) / 1000 : null,
      shocks: shocks, epis: epis,
      periShock: periShock,
      events: ev.length
    };
  }

  /* ---------------- Encerrar + debrief ---------------- */
  function endCode() { $('endDialog').showModal(); }

  function finalizeCode(outcome) {
    $('endDialog').close();
    stopBlueAlarm(); hideBlueOverlay();
    stopMetro();
    if ('speechSynthesis' in window) try { window.speechSynthesis.cancel(); } catch (e) {}
    state.ended = true;
    state.endTime = Date.now();
    state.outcome = outcome;
    if (!state.compRunning) { var o = state.pauses[state.pauses.length - 1]; if (o && o.end === null) o.end = Date.now(); }
    var m = computeMetrics();
    // salvar no banco de indicadores
    var hist = loadHistory();
    hist.unshift({
      id: state.id, ts: state.startTime, endTs: state.endTime, outcome: outcome,
      metrics: m, rhythm: state.rhythm,
      events: state.events, causes: state.causes, term: state.term
    });
    if (hist.length > 200) hist = hist.slice(0, 200);
    saveHistory(hist);
    clearSaved();
    if (wakeLock) { try { wakeLock.release(); } catch (e) {} wakeLock = null; }
    showDebrief(state, m);
  }

  function outcomeLabel(o) {
    return o === 'rosc' ? 'RCE sustentado' : o === 'death' ? 'Óbito' : o === 'transfer' ? 'Transferido em RCP' : 'Outro';
  }

  function showDebrief(s, m) {
    var html = '<p><b>Desfecho:</b> ' + outcomeLabel(s.outcome) + '</p>';
    html += '<div class="agg" style="grid-template-columns:1fr 1fr 1fr">'
      + metricBox(fmt(m.dur), 'Duração')
      + metricBox(m.ccf === null ? '--' : Math.round(m.ccf) + '%', 'Fração compr.')
      + metricBox(m.timeToShock === null ? '—' : fmt(m.timeToShock), '1º choque')
      + metricBox(m.timeToEpi === null ? '—' : fmt(m.timeToEpi), '1ª adrenalina')
      + metricBox(m.shocks, 'Choques')
      + metricBox(m.epis, 'Doses adrenalina')
      + '</div>';
    if (m.periShock !== null) html += '<p style="font-size:.82rem;color:var(--muted)">Maior pausa peri-choque: <b style="color:var(--text)">' + round(m.periShock, 1) + ' s</b></p>';
    // causas trabalhadas
    var causeNames = Object.keys(s.causes).map(function (id) {
      var c = D.causes.filter(function (x) { return x.id === id; })[0];
      return (c ? c.name : id) + ' (' + statusLabel(s.causes[id]) + ')';
    });
    html += '<p style="font-size:.84rem"><b>Causas trabalhadas:</b> ' + (causeNames.length ? causeNames.join('; ') : '<span style="color:var(--amber)">nenhuma registrada</span>') + '</p>';
    // pontos de discussão automáticos
    var notes = [];
    if (m.ccf !== null && m.ccf < 80) notes.push('Fração de compressão abaixo de 80% — revisar pausas/troca de socorrista.');
    if (m.timeToEpi !== null && !s.shockable && m.timeToEpi > 180) notes.push('Adrenalina tardia em ritmo não-chocável (alvo: o quanto antes).');
    if (m.timeToShock !== null && m.timeToShock > 120) notes.push('Tempo até o 1º choque elevado — revisar disponibilidade do desfibrilador.');
    if (!causeNames.length) notes.push('Nenhuma causa reversível foi documentada durante o código.');
    if (notes.length) {
      html += '<p style="font-size:.84rem;margin-top:8px"><b>Pontos para o debrief:</b></p><ul style="padding-left:18px;font-size:.82rem">'
        + notes.map(function (n) { return '<li style="margin:4px 0">' + n + '</li>'; }).join('') + '</ul>';
    } else {
      html += '<p class="ok-msg">✓ Indicadores dentro das metas principais.</p>';
    }
    $('debriefBody').innerHTML = html;
    lastDebrief = { s: s, m: m };
    $('debriefDialog').showModal();
  }
  function metricBox(v, l) { return '<div class="a-box"><div class="av">' + v + '</div><div class="al">' + l + '</div></div>'; }
  var lastDebrief = null;

  /* ---------------- Exportação CSV / PDF ---------------- */
  function recordToCsv(rec) {
    var m = rec.metrics;
    var rows = [];
    rows.push(['Manejo de PCR — Registro do código']);
    rows.push(['Início', new Date(rec.ts).toLocaleString('pt-BR')]);
    rows.push(['Fim', new Date(rec.endTs).toLocaleString('pt-BR')]);
    rows.push(['Desfecho', outcomeLabel(rec.outcome)]);
    rows.push(['Ritmo inicial/predominante', rec.rhythm || '--']);
    rows.push([]);
    rows.push(['Métrica', 'Valor']);
    rows.push(['Duração total (s)', round(m.dur, 0)]);
    rows.push(['Fração de compressão (%)', m.ccf === null ? '' : round(m.ccf, 0)]);
    rows.push(['Tempo até 1º choque (s)', m.timeToShock === null ? '' : round(m.timeToShock, 0)]);
    rows.push(['Tempo até 1ª adrenalina (s)', m.timeToEpi === null ? '' : round(m.timeToEpi, 0)]);
    rows.push(['Nº de choques', m.shocks]);
    rows.push(['Nº de doses de adrenalina', m.epis]);
    rows.push(['Maior pausa peri-choque (s)', m.periShock === null ? '' : round(m.periShock, 1)]);
    rows.push([]);
    rows.push(['Tempo (mm:ss)', 'Evento', 'Detalhe']);
    rec.events.forEach(function (e) {
      rows.push([fmt((e.t - rec.ts) / 1000), e.label, e.meta || '']);
    });
    return rows.map(function (r) {
      return r.map(function (c) { var s = String(c == null ? '' : c); return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';');
    }).join('\n');
  }
  function download(name, text, mime) {
    var blob = new Blob(['﻿' + text], { type: (mime || 'text/csv') + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }
  function exportPdf(rec) {
    var m = rec.metrics;
    var w = window.open('', '_blank');
    if (!w) { alert('Permita pop-ups para gerar o PDF.'); return; }
    var evRows = rec.events.map(function (e) {
      return '<tr><td>' + fmt((e.t - rec.ts) / 1000) + '</td><td>' + escapeHtml(e.label) + '</td><td>' + escapeHtml(e.meta || '') + '</td></tr>';
    }).join('');
    var causeNames = Object.keys(rec.causes || {}).map(function (id) {
      var c = D.causes.filter(function (x) { return x.id === id; })[0];
      return (c ? c.name : id) + ' (' + statusLabel(rec.causes[id]) + ')';
    });
    w.document.write('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Registro PCR</title>'
      + '<style>body{font-family:Arial,sans-serif;color:#111;margin:24px;font-size:13px}h1{font-size:18px}h2{font-size:14px;margin-top:18px;border-bottom:1px solid #ccc;padding-bottom:4px}'
      + 'table{width:100%;border-collapse:collapse;margin-top:6px}td,th{border:1px solid #ddd;padding:5px 7px;text-align:left}'
      + '.grid{display:flex;flex-wrap:wrap;gap:8px}.box{border:1px solid #ddd;border-radius:6px;padding:8px 12px;min-width:120px}.box b{display:block;font-size:16px}'
      + '.disc{color:#666;font-size:11px;margin-top:18px}</style></head><body>'
      + '<h1>Manejo de PCR — Registro do código</h1>'
      + '<p><b>Início:</b> ' + new Date(rec.ts).toLocaleString('pt-BR') + ' &nbsp; <b>Fim:</b> ' + new Date(rec.endTs).toLocaleString('pt-BR')
      + '<br><b>Desfecho:</b> ' + outcomeLabel(rec.outcome) + ' &nbsp; <b>Ritmo:</b> ' + (rec.rhythm || '--') + '</p>'
      + '<h2>Indicadores de qualidade</h2><div class="grid">'
      + '<div class="box"><b>' + fmt(m.dur) + '</b>Duração</div>'
      + '<div class="box"><b>' + (m.ccf === null ? '--' : Math.round(m.ccf) + '%') + '</b>Fração de compressão</div>'
      + '<div class="box"><b>' + (m.timeToShock === null ? '—' : fmt(m.timeToShock)) + '</b>Tempo até 1º choque</div>'
      + '<div class="box"><b>' + (m.timeToEpi === null ? '—' : fmt(m.timeToEpi)) + '</b>Tempo até 1ª adrenalina</div>'
      + '<div class="box"><b>' + m.shocks + '</b>Choques</div>'
      + '<div class="box"><b>' + m.epis + '</b>Doses de adrenalina</div>'
      + '<div class="box"><b>' + (m.periShock === null ? '—' : round(m.periShock, 1) + ' s') + '</b>Maior pausa peri-choque</div></div>'
      + '<h2>Causas reversíveis trabalhadas</h2><p>' + (causeNames.length ? causeNames.join('; ') : 'Nenhuma registrada.') + '</p>'
      + '<h2>Linha do tempo</h2><table><tr><th>Tempo</th><th>Evento</th><th>Detalhe</th></tr>' + evRows + '</table>'
      + '<p class="disc">Documento gerado por aplicativo de apoio à decisão clínica. Não substitui o registro oficial em prontuário nem o julgamento do profissional. Uso adulto.</p>'
      + '</body></html>');
    w.document.close();
    setTimeout(function () { w.focus(); w.print(); }, 400);
  }

  /* ---------------- Indicadores agregados ---------------- */
  function showIndicators() {
    var hist = loadHistory();
    var body = $('indicatorsBody');
    if (!hist.length) { body.innerHTML = '<p style="color:var(--muted)">Nenhum código registrado ainda.</p>'; $('indicatorsDialog').showModal(); return; }
    // agregados
    var n = hist.length;
    var roscN = hist.filter(function (h) { return h.outcome === 'rosc'; }).length;
    var avgCcf = avg(hist.map(function (h) { return h.metrics.ccf; }));
    var avgDur = avg(hist.map(function (h) { return h.metrics.dur; }));
    var html = '<div class="agg">'
      + metricBox(n, 'Códigos')
      + metricBox(Math.round(roscN / n * 100) + '%', 'Taxa de RCE')
      + metricBox(avgCcf === null ? '--' : Math.round(avgCcf) + '%', 'FCC média')
      + metricBox(avgDur === null ? '--' : fmt(avgDur), 'Duração média')
      + '</div>';
    hist.forEach(function (h) {
      var m = h.metrics;
      html += '<div class="hist-item"><div class="h-top">'
        + '<div class="h-out ' + (h.outcome === 'rosc' ? 'rosc' : h.outcome === 'death' ? 'death' : '') + '">' + outcomeLabel(h.outcome) + '</div>'
        + '<div class="h-date">' + new Date(h.ts).toLocaleString('pt-BR') + '</div></div>'
        + '<div class="h-metrics">'
        + '<span>Dur. <b>' + fmt(m.dur) + '</b></span>'
        + '<span>FCC <b>' + (m.ccf === null ? '--' : Math.round(m.ccf) + '%') + '</b></span>'
        + '<span>Choques <b>' + m.shocks + '</b></span>'
        + '<span>Adren. <b>' + m.epis + '</b></span>'
        + '<span>Ritmo <b>' + (h.rhythm || '--') + '</b></span></div>'
        + '<div class="h-actions"><button data-pdf="' + h.id + '">PDF</button><button data-csv="' + h.id + '">CSV</button></div></div>';
    });
    body.innerHTML = html;
    body.querySelectorAll('[data-pdf]').forEach(function (b) {
      b.onclick = function () { var r = hist.filter(function (h) { return h.id === b.getAttribute('data-pdf'); })[0]; if (r) exportPdf(r); };
    });
    body.querySelectorAll('[data-csv]').forEach(function (b) {
      b.onclick = function () { var r = hist.filter(function (h) { return h.id === b.getAttribute('data-csv'); })[0]; if (r) download('pcr_' + r.id + '.csv', recordToCsv(r)); };
    });
    $('indicatorsDialog').showModal();
  }
  function avg(arr) { var v = arr.filter(function (x) { return typeof x === 'number' && isFinite(x); }); return v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : null; }

  /* ---------------- Construção da UI (uma vez por sessão) ---------------- */
  var uiBuilt = false;
  function buildStaticUI() {
    renderCode();
    renderMetro();
    buildCauses();
    if (!uiBuilt) {
      buildSpecial();
      setupInfusions();
      setupTerm();
      uiBuilt = true;
    }
    buildBundle();
    renderTermToggles();
    renderTimeline();
  }

  /* ---------------- Listeners ---------------- */
  function wire() {
    // Código Azul: aciona o alarme de alto volume + inicia o código (metrônomo adiado)
    $('startBtn').addEventListener('click', function () { ensureAudio(); warmSpeech(); startBlueAlarm(); triggerPager(); startCode(false, true); showBlueOverlay(); });
    $('startPlainBtn').addEventListener('click', function () { ensureAudio(); warmSpeech(); startCode(false, false); });
    $('indicatorsBtn').addEventListener('click', showIndicators);
    $('aboutBtn').addEventListener('click', function () { $('aboutDialog').showModal(); });
    $('aboutClose').addEventListener('click', function () { $('aboutDialog').close(); });

    // Equipe / plantão
    $('teamSetupBtn').addEventListener('click', openTeam);
    $('teamBtn').addEventListener('click', openTeam);
    $('pagerBtn').addEventListener('click', openPager);
    $('pagerEnable').addEventListener('click', enablePager);
    $('pagerClose').addEventListener('click', function () { $('pagerDialog').close(); });
    $('memberAdd').addEventListener('click', addMember);
    $('memberName').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addMember(); } });
    $('shiftDate').addEventListener('change', function () { team.shiftDate = $('shiftDate').value; saveTeam(); });
    $('teamClose').addEventListener('click', function () { saveTeam(); $('teamDialog').close(); });
    $('teamClear').addEventListener('click', function () {
      if (confirm('Limpar check-in e designações da equipe?')) { team = defaultTeam(); saveTeam(); renderMembers(); renderRoles(); $('shiftDate').value = team.shiftDate; }
    });

    // Código Azul — overlay de acionamento
    $('baSilence').addEventListener('click', stopBlueAlarm);
    $('baEnter').addEventListener('click', function () {
      stopBlueAlarm(); hideBlueOverlay();
      if (pendingMetro) { pendingMetro = false; startMetro(); }
    });

    document.querySelectorAll('.rhythm-grid button').forEach(function (b) {
      b.addEventListener('click', function () { setRhythm(b.getAttribute('data-rhythm'), b.getAttribute('data-shock') === '1'); });
    });
    document.querySelectorAll('.act[data-act]').forEach(function (b) {
      b.addEventListener('click', function () { doAction(b.getAttribute('data-act')); });
    });
    $('compBtn').addEventListener('click', toggleComp);
    $('metroBtn').addEventListener('click', function () { if (state.metronome.on) stopMetro(); else startMetro(); });
    $('metroDown').addEventListener('click', function () { setBpm(state.metronome.bpm - 5); });
    $('metroUp').addEventListener('click', function () { setBpm(state.metronome.bpm + 5); });
    $('roscBtn').addEventListener('click', markRosc);
    $('endBtn').addEventListener('click', endCode);

    document.querySelectorAll('.bottom-nav button').forEach(function (b) {
      b.addEventListener('click', function () { showView(b.getAttribute('data-nav')); });
    });

    $('muteBtn').addEventListener('click', function () {
      state.muted = !state.muted;
      $('muteBtn').textContent = state.muted ? '🔇' : '🔊';
      $('muteBtn').classList.toggle('active', state.muted);
      save();
    });
    $('shareBtn').addEventListener('click', toggleShared);
    $('ssExit').addEventListener('click', toggleShared);

    $('spClose').addEventListener('click', function () { $('specialDialog').close(); });
    $('commentSave').addEventListener('click', function () {
      var t = $('commentText').value.trim();
      if (t) logEvent('comment', t);
      $('commentDialog').close();
    });
    $('commentCancel').addEventListener('click', function () { $('commentDialog').close(); });

    document.querySelectorAll('#endDialog [data-outcome]').forEach(function (b) {
      b.addEventListener('click', function () { finalizeCode(b.getAttribute('data-outcome')); });
    });
    $('endCancel').addEventListener('click', function () { $('endDialog').close(); });

    $('debriefClose').addEventListener('click', function () { $('debriefDialog').close(); state = null; uiBuilt = false; if (ticker) { clearInterval(ticker); ticker = null; } showStartScreen(); });
    $('debriefPdf').addEventListener('click', function () { if (lastDebrief) exportPdf(historyRecordFromState(lastDebrief.s, lastDebrief.m)); });
    $('debriefCsv').addEventListener('click', function () { if (lastDebrief) { var r = historyRecordFromState(lastDebrief.s, lastDebrief.m); download('pcr_' + r.id + '.csv', recordToCsv(r)); } });

    $('indClose').addEventListener('click', function () { $('indicatorsDialog').close(); });
    $('indCsv').addEventListener('click', function () {
      var hist = loadHistory();
      if (!hist.length) return;
      var all = hist.map(function (h) { return recordToCsv(h); }).join('\n\n==========\n\n');
      download('pcr_indicadores.csv', all);
    });
    $('indClear').addEventListener('click', function () {
      if (confirm('Apagar todo o banco de indicadores? Esta ação não pode ser desfeita.')) { saveHistory([]); showIndicators(); }
    });

    // proteção contra fechamento acidental
    window.addEventListener('beforeunload', function (e) {
      if (state && !state.ended) { e.preventDefault(); e.returnValue = ''; return ''; }
    });
    document.addEventListener('dblclick', function (e) { e.preventDefault(); }, { passive: false });
  }
  function historyRecordFromState(s, m) {
    return { id: s.id, ts: s.startTime, endTs: s.endTime || Date.now(), outcome: s.outcome,
      metrics: m, rhythm: s.rhythm, events: s.events, causes: s.causes, term: s.term };
  }

  /* ---------------- Boot ---------------- */
  wire();
  showStartScreen();
})();
