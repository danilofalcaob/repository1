/**
 * App nativo — Manejo de PCR (copiloto clínico) + pager de alarme crítico.
 * Integra o motor do código, as telas clínicas, equipe e Código Azul.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  SafeAreaView, View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, StatusBar,
} from 'react-native';
import {
  requestPermissions, registerForegroundHandlers, displayCodeBlue, stopCodeBlue,
} from './src/notifications';
import { loadConfig, saveConfig, enablePager, triggerCodeBlue, PagerConfig } from './src/pager';
import { loadTeam } from './src/teamStore';
import { CodeProvider, useCode, Metrics } from './src/useCode';
import {
  CodeScreen, CausesScreen, SpecialScreen, PostScreen, TerminationScreen,
  TimelineScreen, TeamScreen, DebriefModal,
} from './src/screens';

const C = { bg: '#0b0f17', panel: '#161c28', panel2: '#1f2735', line: 'rgba(255,255,255,.1)', text: '#f1f5f9', muted: '#94a3b8', red: '#ef4444', blue: '#1d4ed8' };

type Tab = 'code' | 'causes' | 'special' | 'post' | 'term' | 'log' | 'team';
const TABS: [Tab, string][] = [
  ['code', 'Código'], ['causes', 'Causas'], ['special', 'Especiais'],
  ['post', 'Pós-RCE'], ['term', 'Término'], ['log', 'Log'], ['team', 'Equipe'],
];

function Main() {
  const { code, recovered, start, recover, discardRecovered, reset } = useCode();
  const [tab, setTab] = useState<Tab>('code');
  const [debrief, setDebrief] = useState<{ m: Metrics; outcome: string } | null>(null);
  const [alarm, setAlarm] = useState(false);
  const [pagerOpen, setPagerOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);

  useEffect(() => {
    requestPermissions().catch(() => {});
    const unsub = registerForegroundHandlers();
    return unsub;
  }, []);

  const codeBlue = useCallback(async () => {
    start();
    setTab('code');
    setAlarm(true);
    await displayCodeBlue();           // alarme local (notifee)
    const team = await loadTeam();
    triggerCodeBlue(team);             // aciona os demais (não bloqueante)
  }, [start]);

  const silence = useCallback(() => { setAlarm(false); stopCodeBlue(); }, []);

  // ----- Tela inicial (sem código ativo) -----
  if (!code || code.ended) {
    return (
      <SafeAreaView style={st.safe}>
        <StatusBar barStyle="light-content" />
        <Text style={st.h1}>Manejo de PCR — Adulto</Text>
        <Text style={st.sub}>Copiloto clínico de ressuscitação</Text>

        {recovered && (
          <View style={st.recover}>
            <Text style={{ color: '#fcd34d', fontWeight: '700', marginBottom: 8 }}>⚠️ Código em andamento recuperável</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={[st.rcBtn, { backgroundColor: '#16a34a' }]} onPress={recover}><Text style={st.rcTxt}>Recuperar</Text></TouchableOpacity>
              <TouchableOpacity style={[st.rcBtn, { borderColor: C.red, borderWidth: 1 }]} onPress={discardRecovered}><Text style={[st.rcTxt, { color: C.red }]}>Descartar</Text></TouchableOpacity>
            </View>
          </View>
        )}

        <View style={st.center}>
          <TouchableOpacity style={st.blue} onPress={codeBlue}>
            <Text style={{ fontSize: 50 }}>🔵</Text>
            <Text style={st.blueLabel}>CÓDIGO AZUL</Text>
            <Text style={{ color: '#bcd0ff', marginTop: 4 }}>Aciona a equipe e inicia</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { start(); setTab('code'); }}><Text style={st.plain}>Iniciar sem acionar o alarme</Text></TouchableOpacity>
        </View>

        <View style={st.foot}>
          <TouchableOpacity style={st.footBtn} onPress={() => setTeamOpen(true)}><Text style={st.footTxt}>👥 Equipe</Text></TouchableOpacity>
          <TouchableOpacity style={st.footBtn} onPress={() => setPagerOpen(true)}><Text style={st.footTxt}>📟 Pager</Text></TouchableOpacity>
        </View>

        {teamOpen && <FullModal onClose={() => setTeamOpen(false)}><TeamScreen /></FullModal>}
        {pagerOpen && <PagerConfig onClose={() => setPagerOpen(false)} />}
      </SafeAreaView>
    );
  }

  // ----- Código ativo -----
  return (
    <SafeAreaView style={st.safe}>
      <StatusBar barStyle="light-content" />
      {alarm && (
        <TouchableOpacity style={st.alarmBar} onPress={silence}>
          <Text style={{ color: '#fff', fontWeight: '800' }}>🔵 CÓDIGO AZUL ativo — toque para silenciar</Text>
        </TouchableOpacity>
      )}
      <View style={{ flex: 1 }}>
        {tab === 'code' && <CodeScreen onEnded={(m, outcome) => setDebrief({ m, outcome })} />}
        {tab === 'causes' && <CausesScreen />}
        {tab === 'special' && <SpecialScreen />}
        {tab === 'post' && <PostScreen />}
        {tab === 'term' && <TerminationScreen />}
        {tab === 'log' && <TimelineScreen />}
        {tab === 'team' && <TeamScreen />}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.nav} contentContainerStyle={{ alignItems: 'center' }}>
        {TABS.map(([t, label]) => (
          <TouchableOpacity key={t} style={st.navBtn} onPress={() => setTab(t)}>
            <Text style={{ color: tab === t ? C.red : C.muted, fontWeight: '700' }}>{label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {debrief && <DebriefModal m={debrief.m} outcome={debrief.outcome} onClose={() => { setDebrief(null); silence(); reset(); setTab('code'); }} />}
    </SafeAreaView>
  );
}

function FullModal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <View style={st.modalWrap}>
      <SafeAreaView style={{ flex: 1 }}>
        <TouchableOpacity style={st.modalClose} onPress={onClose}><Text style={{ color: C.text, fontWeight: '700' }}>✕ Fechar</Text></TouchableOpacity>
        {children}
      </SafeAreaView>
    </View>
  );
}

function PagerConfig({ onClose }: { onClose: () => void }) {
  const [cfg, setCfg] = useState<PagerConfig>({ url: '', team: '', name: '' });
  useEffect(() => { loadConfig().then(setCfg); }, []);
  return (
    <FullModal onClose={onClose}>
      <ScrollView style={{ paddingHorizontal: 16 }}>
        <Text style={st.h2}>Pager (servidor Web Push / FCM)</Text>
        {(['url', 'team', 'name'] as const).map((k) => (
          <View key={k} style={{ marginBottom: 10 }}>
            <Text style={st.small}>{k === 'url' ? 'URL do servidor' : k === 'team' ? 'Equipe / unidade' : 'Seu nome'}</Text>
            <TextInput style={st.input} autoCapitalize="none" value={(cfg as any)[k]} onChangeText={(v) => setCfg({ ...cfg, [k]: v })} placeholderTextColor={C.muted} />
          </View>
        ))}
        <TouchableOpacity style={st.addBtn} onPress={async () => {
          try { await enablePager(cfg); await saveConfig({ ...cfg, enabled: true }); Alert.alert('Pager', 'Ativado neste aparelho ✓'); }
          catch (e: any) { Alert.alert('Falha', String(e?.message || e)); }
        }}><Text style={{ color: '#fff', fontWeight: '700', textAlign: 'center' }}>Ativar neste aparelho</Text></TouchableOpacity>
        <Text style={[st.small, { marginTop: 12 }]}>Use a mesma equipe/unidade em todos os aparelhos. No iOS, o som alto com app fechado exige Critical Alerts (ver README).</Text>
      </ScrollView>
    </FullModal>
  );
}

export default function App() {
  return (
    <CodeProvider>
      <Main />
    </CodeProvider>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  h1: { color: C.text, fontSize: 20, fontWeight: '800', textAlign: 'center', paddingTop: 14 },
  h2: { color: C.muted, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, marginVertical: 12, fontWeight: '700' },
  small: { color: C.muted, fontSize: 12 },
  sub: { color: C.muted, textAlign: 'center', marginTop: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  blue: { width: 250, height: 250, borderRadius: 125, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' },
  blueLabel: { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 1, marginTop: 6 },
  plain: { color: C.muted, textDecorationLine: 'underline', marginTop: 18 },
  foot: { flexDirection: 'row', justifyContent: 'center', gap: 12, paddingBottom: 16 },
  footBtn: { backgroundColor: C.panel2, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 18 },
  footTxt: { color: C.text, fontWeight: '600' },
  recover: { backgroundColor: C.panel, borderWidth: 1, borderColor: '#f59e0b', borderRadius: 14, padding: 14, margin: 16 },
  rcBtn: { flex: 1, borderRadius: 10, padding: 12, alignItems: 'center' },
  rcTxt: { color: '#fff', fontWeight: '700' },
  alarmBar: { backgroundColor: C.blue, padding: 12, alignItems: 'center' },
  nav: { borderTopWidth: 1, borderColor: C.line, backgroundColor: C.panel, maxHeight: 52 },
  navBtn: { paddingHorizontal: 16, paddingVertical: 14 },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 12, color: C.text, backgroundColor: C.bg, fontSize: 16 },
  addBtn: { backgroundColor: C.red, borderRadius: 10, padding: 14, marginTop: 6 },
  modalWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.bg },
  modalClose: { padding: 16 },
});
