/**
 * App nativo — núcleo de acionamento (Código Azul) + equipe + pager.
 * Scaffold focado no alarme crítico. Para o app completo, porte os módulos
 * clínicos do PWA (timer, 5H/5T, pós-RCE etc.).
 */
import React, { useEffect, useState } from 'react';
import {
  SafeAreaView, View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, useColorScheme,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  requestPermissions, registerForegroundHandlers, displayCodeBlue, stopCodeBlue,
} from './src/notifications';
import { loadConfig, saveConfig, enablePager, triggerCodeBlue, PagerConfig } from './src/pager';
import { ROLES, TeamState, Member } from './src/clinicalData';

const TEAM_KEY = 'pcr_team';
const todayStr = () => new Date().toISOString().slice(0, 10);
const emptyTeam = (): TeamState => ({ shiftDate: todayStr(), members: [], roles: {} });

export default function App() {
  const dark = useColorScheme() !== 'light';
  const [tab, setTab] = useState<'code' | 'team' | 'pager'>('code');
  const [team, setTeam] = useState<TeamState>(emptyTeam());
  const [paging, setPaging] = useState(false);
  const [memberName, setMemberName] = useState('');
  const [cfg, setCfg] = useState<PagerConfig>({ url: '', team: '', name: '' });

  useEffect(() => {
    requestPermissions().catch(() => {});
    const unsub = registerForegroundHandlers();
    AsyncStorage.getItem(TEAM_KEY).then((r) => r && setTeam(JSON.parse(r)));
    loadConfig().then(setCfg);
    return unsub;
  }, []);

  const persistTeam = (t: TeamState) => {
    setTeam(t);
    AsyncStorage.setItem(TEAM_KEY, JSON.stringify(t));
  };

  const rolesCountFor = (id: string) =>
    ROLES.filter((r) => team.roles[r.id] === id).length;

  const addMember = () => {
    const name = memberName.trim();
    if (!name) return;
    const m: Member = { id: 'm' + Date.now(), name };
    persistTeam({ ...team, members: [...team.members, m] });
    setMemberName('');
  };

  const assign = (roleId: string, memberId: string) => {
    if (memberId && team.roles[roleId] !== memberId && rolesCountFor(memberId) >= 2) {
      Alert.alert('Limite', 'Um membro pode acumular no máximo 2 funções.');
      return;
    }
    const roles = { ...team.roles };
    if (memberId) roles[roleId] = memberId; else delete roles[roleId];
    persistTeam({ ...team, roles });
  };

  const onCodeBlue = async () => {
    setPaging(true);
    await displayCodeBlue({
      roles: JSON.stringify(
        ROLES.filter((r) => team.roles[r.id]).map((r) => {
          const m = team.members.find((x) => x.id === team.roles[r.id]);
          return r.name + ': ' + (m ? m.name : '—');
        }),
      ),
    });
    triggerCodeBlue(team); // aciona os demais (não bloqueante)
  };

  const onStop = async () => { setPaging(false); await stopCodeBlue(); };

  const onEnablePager = async () => {
    try {
      await enablePager(cfg);
      Alert.alert('Pager', 'Ativado neste aparelho ✓');
      setCfg({ ...cfg, enabled: true });
    } catch (e: any) {
      Alert.alert('Falha', String(e?.message || e));
    }
  };

  const c = dark ? colors.dark : colors.light;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
      <Text style={[styles.h1, { color: c.text }]}>Manejo de PCR</Text>

      {tab === 'code' && (
        <View style={styles.center}>
          {!paging ? (
            <TouchableOpacity style={styles.blueBtn} onPress={onCodeBlue}>
              <Text style={styles.blueIcon}>🔵</Text>
              <Text style={styles.blueLabel}>CÓDIGO AZUL</Text>
              <Text style={styles.blueSub}>Aciona a equipe</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.center}>
              <Text style={[styles.paging, { color: c.text }]}>🔵 Acionando a equipe…</Text>
              {ROLES.filter((r) => team.roles[r.id]).map((r) => {
                const m = team.members.find((x) => x.id === team.roles[r.id]);
                return (
                  <Text key={r.id} style={{ color: c.muted, marginVertical: 2 }}>
                    {r.name}: <Text style={{ color: c.text, fontWeight: '800' }}>{m?.name || '—'}</Text>
                  </Text>
                );
              })}
              <TouchableOpacity style={styles.stopBtn} onPress={onStop}>
                <Text style={styles.stopLabel}>🔇 Silenciar</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {tab === 'team' && (
        <ScrollView style={styles.body}>
          <Text style={[styles.h2, { color: c.muted }]}>Check-in da equipe</Text>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, { color: c.text, borderColor: c.line }]}
              placeholder="Nome do membro" placeholderTextColor={c.muted}
              value={memberName} onChangeText={setMemberName}
            />
            <TouchableOpacity style={styles.addBtn} onPress={addMember}>
              <Text style={styles.addLabel}>Check-in</Text>
            </TouchableOpacity>
          </View>
          {team.members.map((m) => (
            <View key={m.id} style={[styles.line, { borderColor: c.line }]}>
              <Text style={{ color: c.text, flex: 1 }}>{m.name}</Text>
              <TouchableOpacity onPress={() => persistTeam({
                ...team,
                members: team.members.filter((x) => x.id !== m.id),
                roles: Object.fromEntries(Object.entries(team.roles).filter(([, v]) => v !== m.id)),
              })}>
                <Text style={{ color: '#f87171' }}>remover</Text>
              </TouchableOpacity>
            </View>
          ))}

          <Text style={[styles.h2, { color: c.muted }]}>Designação de funções</Text>
          {ROLES.map((r) => (
            <View key={r.id} style={[styles.line, { borderColor: c.line }]}>
              <Text style={{ color: c.text, flex: 1 }}>{r.name}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <TouchableOpacity onPress={() => assign(r.id, '')}>
                  <Text style={[chip(!team.roles[r.id]), { color: c.text }]}>—</Text>
                </TouchableOpacity>
                {team.members.map((m) => (
                  <TouchableOpacity key={m.id} onPress={() => assign(r.id, m.id)}>
                    <Text style={[chip(team.roles[r.id] === m.id), { color: c.text }]}>{m.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ))}
          <Text style={{ color: c.muted, fontSize: 12, marginTop: 12 }}>
            Um membro pode acumular até 2 funções (times incompletos).
          </Text>
        </ScrollView>
      )}

      {tab === 'pager' && (
        <ScrollView style={styles.body}>
          <Text style={[styles.h2, { color: c.muted }]}>Pager (servidor)</Text>
          {(['url', 'team', 'name'] as const).map((k) => (
            <TextInput
              key={k}
              style={[styles.input, { color: c.text, borderColor: c.line, marginBottom: 10 }]}
              placeholder={k === 'url' ? 'URL do servidor' : k === 'team' ? 'Equipe / unidade' : 'Seu nome'}
              placeholderTextColor={c.muted} autoCapitalize="none"
              value={(cfg as any)[k]} onChangeText={(v) => setCfg({ ...cfg, [k]: v })}
            />
          ))}
          <TouchableOpacity style={styles.addBtn} onPress={onEnablePager}>
            <Text style={styles.addLabel}>Ativar neste aparelho</Text>
          </TouchableOpacity>
          <Text style={{ color: c.muted, fontSize: 12, marginTop: 12 }}>
            {cfg.enabled ? 'Pager ativado neste aparelho ✓' : 'Use a mesma equipe/unidade em todos os aparelhos.'}
          </Text>
        </ScrollView>
      )}

      <View style={[styles.nav, { borderColor: c.line }]}>
        {(['code', 'team', 'pager'] as const).map((t) => (
          <TouchableOpacity key={t} style={styles.navBtn} onPress={() => setTab(t)}>
            <Text style={{ color: tab === t ? '#ef4444' : c.muted, fontWeight: '700' }}>
              {t === 'code' ? 'Código' : t === 'team' ? 'Equipe' : 'Pager'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const chip = (on: boolean) => ({
  paddingVertical: 8, paddingHorizontal: 12, marginRight: 6, borderRadius: 16,
  overflow: 'hidden' as const, backgroundColor: on ? 'rgba(34,197,94,.3)' : 'rgba(127,127,127,.2)',
  fontWeight: '700' as const,
});

const colors = {
  dark: { bg: '#0b0f17', text: '#f1f5f9', muted: '#94a3b8', line: 'rgba(255,255,255,.1)' },
  light: { bg: '#f8fafc', text: '#0b0f17', muted: '#64748b', line: 'rgba(0,0,0,.1)' },
};

const styles = StyleSheet.create({
  safe: { flex: 1 },
  h1: { fontSize: 18, fontWeight: '800', textAlign: 'center', paddingVertical: 12 },
  h2: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 16, marginBottom: 8, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  body: { flex: 1, paddingHorizontal: 16 },
  blueBtn: {
    width: 260, height: 260, borderRadius: 130, backgroundColor: '#1d4ed8',
    alignItems: 'center', justifyContent: 'center',
  },
  blueIcon: { fontSize: 56 },
  blueLabel: { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 1, marginTop: 6 },
  blueSub: { color: '#bcd0ff', marginTop: 4 },
  paging: { fontSize: 22, fontWeight: '800', marginBottom: 16 },
  stopBtn: { marginTop: 24, backgroundColor: '#dc2626', paddingVertical: 16, paddingHorizontal: 28, borderRadius: 14 },
  stopLabel: { color: '#fff', fontWeight: '800', fontSize: 16 },
  row: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 16 },
  addBtn: { backgroundColor: '#ef4444', borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' },
  addLabel: { color: '#fff', fontWeight: '700' },
  line: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1 },
  nav: { flexDirection: 'row', borderTopWidth: 1 },
  navBtn: { flex: 1, alignItems: 'center', paddingVertical: 14 },
});
