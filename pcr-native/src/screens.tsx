/**
 * Telas clínicas (porte de pcr/index.html + app.js): Código, Causas (5H/5T),
 * Especiais, Pós-RCE (+ infusões), Término, Linha do tempo, Equipe e Pager.
 * Estilo enxuto; foco na lógica. Tema escuro.
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Modal, StyleSheet, Alert,
} from 'react-native';
import { useCode, Metrics } from './useCode';
import {
  CAUSES, SPECIAL, BUNDLE, ROLES, NORA_PRESETS, AMIO_PRESETS, NORA_CONC_RANGE,
  AMIO_CONC_RANGE, CAUSE_NUDGE_SEC, TeamState,
} from './clinicalData';
import { fmt, fmtSigned, calcNora, calcAmio } from './format';
import { loadTeam, saveTeam, emptyTeam } from './teamStore';
import * as metro from './metronome';

const C = { bg: '#0b0f17', panel: '#161c28', panel2: '#1f2735', line: 'rgba(255,255,255,.1)', text: '#f1f5f9', muted: '#94a3b8', red: '#ef4444', green: '#16a34a', greenL: '#4ade80', amber: '#f59e0b', shock: '#f97316', nonshock: '#3b82f6', epi: '#a855f7' };

/* ---------- componentes utilitários ---------- */
function Chooser({ title, options, onClose }: { title: string; options: { label: string; onPress: () => void }[]; onClose: () => void }) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <Text style={s.sheetTitle}>{title}</Text>
          {options.map((o, i) => (
            <TouchableOpacity key={i} style={s.sheetBtn} onPress={() => { o.onPress(); onClose(); }}>
              <Text style={s.sheetBtnTxt}>{o.label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={[s.sheetBtn, { backgroundColor: C.red }]} onPress={onClose}>
            <Text style={[s.sheetBtnTxt, { color: '#fff' }]}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/* ---------- Código ---------- */
export function CodeScreen({ onEnded }: { onEnded: (m: Metrics, outcome: string) => void }) {
  const C2 = useCode();
  const { code } = C2;
  const [, force] = useState(0);
  const [chooser, setChooser] = useState<null | { title: string; options: any[] }>(null);
  const [comment, setComment] = useState<string | null>(null);
  const [bpm, setBpm] = useState(metro.getBpm());
  const [metroOn, setMetroOn] = useState(metro.isOn());

  useEffect(() => { const id = setInterval(() => force((x) => x + 1), 300); return () => clearInterval(id); }, []);
  if (!code) return null;

  const cr = C2.cycleRem();
  const ee = C2.epiElapsed();
  const ccf = C2.ccf();
  const total = C2.totalSec();
  const shocks = code.events.filter((e) => e.type === 'shock').length;
  const epis = code.events.filter((e) => e.type === 'epi').length;
  const anyCause = Object.keys(code.causes).length > 0;

  const next = !code.rhythm ? 'Selecione o ritmo e inicie as compressões.'
    : cr <= 0 ? '⏱️ FIM DO CICLO — CHECAR RITMO (pausa ≤ 10 s)'
    : ee != null && ee >= 240 ? '💉 ADRENALINA DISPONÍVEL (a cada 3–5 min)'
    : code.shockable ? '⚡ Chocável — desfibrilar, RCP 2 min, adrenalina + antiarrítmico'
    : '🔁 Não-chocável — RCP, adrenalina o quanto antes, buscar 5H/5T';

  return (
    <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 30 }}>
      <View style={s.timers}>
        <Timer label="Parada" value={fmt(total)} />
        <Timer label="Ciclo 2 min" value={fmtSigned(cr)} color={cr <= 0 ? C.red : C.greenL} />
        <Timer label="Adrenalina" value={ee == null ? '--' : fmt(ee)} color={ee != null && ee >= 240 ? C.red : C.epi} />
      </View>

      <Text style={[s.push, { borderColor: cr <= 0 ? C.red : C.line }]}>{next}</Text>
      {!anyCause && total >= CAUSE_NUDGE_SEC && (
        <Text style={[s.push, { borderColor: C.amber, color: C.amber }]}>🔎 {Math.floor(total / 60)} min sem causa trabalhada — veja 5H/5T (aba Causas)</Text>
      )}

      <Text style={s.h2}>Ritmo atual</Text>
      <View style={s.row3}>
        {[['FV/TV', true], ['AESP', false], ['Assistolia', false]].map(([r, sh]) => (
          <TouchableOpacity key={r as string} style={[s.rhythmBtn, code.rhythm === r && { borderColor: sh ? C.shock : C.nonshock, backgroundColor: (sh ? 'rgba(249,115,22,.2)' : 'rgba(59,130,246,.2)') }]} onPress={() => C2.setRhythm(r as string, sh as boolean)}>
            <Text style={[s.rhythmTxt, { color: code.rhythm === r ? (sh ? C.shock : C.nonshock) : C.text }]}>{r}</Text>
            <Text style={s.small}>{sh ? 'chocável' : 'não-chocável'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={s.rowG}>
        <TouchableOpacity style={[s.compBtn, { borderColor: code.compRunning ? C.green : C.red, backgroundColor: code.compRunning ? 'rgba(22,163,74,.18)' : 'rgba(220,38,38,.2)' }]} onPress={C2.toggleComp}>
          <Text style={{ color: code.compRunning ? C.greenL : C.red, fontWeight: '800' }}>COMPRESSÕES</Text>
          <Text style={s.small}>{code.compRunning ? 'em andamento' : 'PAUSADAS — retomar'}</Text>
        </TouchableOpacity>
        <View style={s.ccfBox}>
          <Text style={s.small}>FRAÇÃO COMPR.</Text>
          <Text style={{ color: ccf != null && ccf >= 80 ? C.greenL : C.amber, fontSize: 24, fontWeight: '800' }}>{ccf == null ? '--' : Math.round(ccf) + '%'}</Text>
        </View>
      </View>

      <View style={s.rowG}>
        <TouchableOpacity style={[s.metroBtn, metroOn && { borderColor: C.red, backgroundColor: 'rgba(239,68,68,.18)' }]} onPress={() => { setMetroOn(metro.toggle()); }}>
          <Text style={{ color: metroOn ? '#fca5a5' : C.text, fontWeight: '800' }}>{metroOn ? '⏸ Metrônomo' : '▶ Metrônomo'}</Text>
          <Text style={s.small}>{bpm}/min</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.adj} onPress={() => setBpm(metro.setBpm(bpm - 5))}><Text style={s.adjTxt}>−</Text></TouchableOpacity>
        <TouchableOpacity style={s.adj} onPress={() => setBpm(metro.setBpm(bpm + 5))}><Text style={s.adjTxt}>+</Text></TouchableOpacity>
      </View>

      <Text style={s.h2}>Registro rápido</Text>
      <View style={s.grid}>
        <Act label="Choque" sub={shocks + ' adm.'} color={C.shock} onPress={C2.shock} />
        <Act label="Adrenalina" sub={epis + ' doses'} color={C.epi} onPress={C2.epi} />
        <Act label="Antiarrítmico" sub="amio / lido" onPress={() => setChooser({ title: 'Antiarrítmico', options: [
          { label: 'Amiodarona 300 mg (1ª)', onPress: () => C2.log('antiarr', 'Amiodarona 300 mg IV/IO', '1ª dose') },
          { label: 'Amiodarona 150 mg (2ª)', onPress: () => C2.log('antiarr', 'Amiodarona 150 mg IV/IO', '2ª dose') },
          { label: 'Lidocaína 1–1,5 mg/kg', onPress: () => C2.log('antiarr', 'Lidocaína 1–1,5 mg/kg IV/IO') },
        ] })} />
        <Act label="Checar ritmo" sub="e pulso" color={C.green} onPress={() => setChooser({ title: 'Checagem de ritmo / pulso', options: [
          { label: 'Sem pulso — manter RCP', onPress: () => C2.pulse(false) },
          { label: 'Com pulso — avaliar RCE', onPress: () => C2.pulse(true) },
        ] })} />
        <Act label="Via aérea" sub="IOT / supra" onPress={() => setChooser({ title: 'Via aérea', options: [
          { label: 'Intubação (IOT)', onPress: () => C2.log('airway', 'Via aérea: IOT') },
          { label: 'Supraglótico', onPress: () => C2.log('airway', 'Via aérea: supraglótico') },
          { label: 'Bolsa-válvula-máscara', onPress: () => C2.log('airway', 'Via aérea: BVM') },
        ] })} />
        <Act label="Acesso" sub="venoso / IO" onPress={() => setChooser({ title: 'Acesso', options: [
          { label: 'Venoso periférico', onPress: () => C2.log('access', 'Acesso: venoso') },
          { label: 'Intraósseo (IO)', onPress: () => C2.log('access', 'Acesso: intraósseo') },
          { label: 'Venoso central', onPress: () => C2.log('access', 'Acesso: venoso central') },
        ] })} />
        <Act label="Comentário" sub="livre" onPress={() => setComment('')} />
        <Act label="Desfazer" sub="último" onPress={() => {
          if (!code.events.length) return;
          Alert.alert('Desfazer', 'Desfazer o último evento?', [{ text: 'Não' }, { text: 'Sim', onPress: () => C2.undo() }]);
        }} />
      </View>

      <TouchableOpacity style={s.roscBtn} onPress={C2.markRosc}><Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>✓ RCE — Retorno da Circulação</Text></TouchableOpacity>
      <TouchableOpacity style={s.endBtn} onPress={() => setChooser({ title: 'Encerrar código — desfecho', options: [
        { label: 'RCE sustentado', onPress: () => onEnded(C2.end('rosc'), 'rosc') },
        { label: 'Óbito', onPress: () => onEnded(C2.end('death'), 'death') },
        { label: 'Transferido em RCP', onPress: () => onEnded(C2.end('transfer'), 'transfer') },
        { label: 'Outro', onPress: () => onEnded(C2.end('other'), 'other') },
      ] })}>
        <Text style={{ color: C.red, fontWeight: '800' }}>Encerrar código</Text>
      </TouchableOpacity>

      {chooser && <Chooser title={chooser.title} options={chooser.options} onClose={() => setChooser(null)} />}
      {comment != null && (
        <Modal transparent animationType="fade" onRequestClose={() => setComment(null)}>
          <View style={s.backdrop}><View style={s.sheet}>
            <Text style={s.sheetTitle}>Comentário livre</Text>
            <TextInput style={s.input} multiline value={comment} onChangeText={setComment} placeholder="Observação…" placeholderTextColor={C.muted} />
            <TouchableOpacity style={s.sheetBtn} onPress={() => { if (comment.trim()) C2.log('comment', comment.trim()); setComment(null); }}><Text style={s.sheetBtnTxt}>Registrar</Text></TouchableOpacity>
          </View></View>
        </Modal>
      )}
    </ScrollView>
  );
}

const Timer = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <View style={s.tmr}><Text style={s.small}>{label}</Text><Text style={[s.tmrV, color ? { color } : null]}>{value}</Text></View>
);
const Act = ({ label, sub, color, onPress }: { label: string; sub?: string; color?: string; onPress: () => void }) => (
  <TouchableOpacity style={[s.act, color ? { borderColor: color } : null]} onPress={onPress}>
    <Text style={{ color: C.text, fontWeight: '700' }}>{label}</Text>
    {sub ? <Text style={s.small}>{sub}</Text> : null}
  </TouchableOpacity>
);

/* ---------- Causas 5H/5T ---------- */
export function CausesScreen() {
  const { code, setCause } = useCode();
  const [open, setOpen] = useState<string | null>(null);
  if (!code) return null;
  return (
    <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 30 }}>
      <Text style={s.h2}>Causas reversíveis — 5H e 5T</Text>
      {CAUSES.map((c) => {
        const st = code.causes[c.id];
        return (
          <View key={c.id} style={s.card}>
            <TouchableOpacity style={s.rowG} onPress={() => setOpen(open === c.id ? null : c.id)}>
              <View style={s.letter}><Text style={{ color: C.text, fontWeight: '800' }}>{c.letter}</Text></View>
              <View style={{ flex: 1 }}><Text style={{ color: C.text, fontWeight: '700' }}>{c.name}</Text><Text style={s.small}>{c.hint}</Text></View>
              <Text style={[s.tag, st === 'treating' && { color: C.greenL }, st === 'considered' && { color: '#93c5fd' }]}>{st ? (st === 'considered' ? 'Considerada' : st === 'discarded' ? 'Descartada' : 'Em tratamento') : 'Pendente'}</Text>
            </TouchableOpacity>
            {open === c.id && (
              <View style={{ marginTop: 8 }}>
                <Text style={s.conduct}>{c.conduct}</Text>
                <View style={s.row3}>
                  {(['considered', 'discarded', 'treating'] as const).map((v) => (
                    <TouchableOpacity key={v} style={[s.seg, st === v && { borderColor: C.greenL, backgroundColor: 'rgba(34,197,94,.2)' }]} onPress={() => setCause(c.id, v)}>
                      <Text style={{ color: C.text, fontSize: 12, fontWeight: '700' }}>{v === 'considered' ? 'Considerada' : v === 'discarded' ? 'Descartada' : 'Tratando'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

/* ---------- Especiais ---------- */
export function SpecialScreen() {
  const [sel, setSel] = useState<string | null>(null);
  const item = SPECIAL.find((x) => x.id === sel);
  return (
    <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 30 }}>
      <Text style={s.h2}>Circunstâncias especiais</Text>
      {SPECIAL.map((sp) => (
        <TouchableOpacity key={sp.id} style={s.card} onPress={() => setSel(sp.id)}>
          <Text style={{ color: C.text, fontWeight: '700' }}>{sp.title}</Text>
          <Text style={s.small}>{sp.sub}</Text>
        </TouchableOpacity>
      ))}
      {item && (
        <Modal animationType="slide" onRequestClose={() => setSel(null)}>
          <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 20, paddingTop: 50 }}>
            <Text style={{ color: C.text, fontSize: 20, fontWeight: '800' }}>{item.title}</Text>
            <Text style={[s.small, { marginBottom: 12 }]}>{item.sub}</Text>
            {item.body.map((b, i) => <Text key={i} style={{ color: '#cbd5e1', marginBottom: 8, lineHeight: 20 }}>{i === 0 ? b : '• ' + b}</Text>)}
            <TouchableOpacity style={s.sheetBtn} onPress={() => setSel(null)}><Text style={s.sheetBtnTxt}>Fechar</Text></TouchableOpacity>
          </ScrollView>
        </Modal>
      )}
    </ScrollView>
  );
}

/* ---------- Pós-RCE + infusões ---------- */
export function PostScreen() {
  const { code, toggleBundle } = useCode();
  const [nm, setNm] = useState({ mass: '16', vol: '250', w: '70', dose: '0.1' });
  const [am, setAm] = useState({ mass: '900', vol: '500', dose: '1' });
  if (!code) return null;
  const n = calcNora(+nm.mass, +nm.vol, +nm.w, +nm.dose, NORA_CONC_RANGE);
  const a = calcAmio(+am.mass, +am.vol, +am.dose, AMIO_CONC_RANGE);
  return (
    <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 30 }}>
      <Text style={s.h2}>Bundle pós-parada</Text>
      {BUNDLE.map((b) => (
        <TouchableOpacity key={b.id} style={s.bundle} onPress={() => toggleBundle(b.id)}>
          <View style={[s.box, code.bundle[b.id] && { backgroundColor: C.green, borderColor: C.green }]}><Text style={{ color: '#fff' }}>{code.bundle[b.id] ? '✓' : ''}</Text></View>
          <View style={{ flex: 1 }}><Text style={{ color: code.bundle[b.id] ? C.muted : C.text }}>{b.title}</Text><Text style={s.small}>{b.sub}</Text></View>
        </TouchableOpacity>
      ))}

      <Text style={s.h2}>Infusão — Noradrenalina</Text>
      <View style={s.presetRow}>{NORA_PRESETS.map((p) => <TouchableOpacity key={p.label} style={s.preset} onPress={() => setNm({ ...nm, mass: String(p.mass), vol: String(p.vol) })}><Text style={s.small}>{p.label}</Text></TouchableOpacity>)}</View>
      <Fields obj={nm} set={setNm as any} keys={[['mass', 'Massa (mg)'], ['vol', 'Volume (mL)'], ['w', 'Peso (kg)'], ['dose', 'Dose (mcg/kg/min)']]} />
      <Result conc={n.conc + ' mcg/mL'} rate={n.rate} implausible={n.implausible} range={`${NORA_CONC_RANGE.min}–${NORA_CONC_RANGE.max} mcg/mL`} />

      <Text style={s.h2}>Infusão — Amiodarona</Text>
      <View style={s.presetRow}>{AMIO_PRESETS.map((p) => <TouchableOpacity key={p.label} style={s.preset} onPress={() => setAm({ ...am, mass: String(p.mass), vol: String(p.vol) })}><Text style={s.small}>{p.label}</Text></TouchableOpacity>)}</View>
      <Fields obj={am} set={setAm as any} keys={[['mass', 'Massa (mg)'], ['vol', 'Volume (mL)'], ['dose', 'Dose (mg/min)']]} />
      <Result conc={a.conc + ' mg/mL'} rate={a.rate} implausible={a.implausible} range={`${AMIO_CONC_RANGE.min}–${AMIO_CONC_RANGE.max} mg/mL`} />
      <Text style={[s.small, { marginTop: 12 }]}>A checagem de concentração sinaliza diluições implausíveis. Sempre confira a apresentação real. Uso adulto.</Text>
    </ScrollView>
  );
}
const Fields = ({ obj, set, keys }: { obj: any; set: (o: any) => void; keys: [string, string][] }) => (
  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
    {keys.map(([k, label]) => (
      <View key={k} style={{ width: '47%' }}>
        <Text style={s.small}>{label}</Text>
        <TextInput style={s.input} keyboardType="numeric" value={obj[k]} onChangeText={(v) => set({ ...obj, [k]: v })} />
      </View>
    ))}
  </View>
);
const Result = ({ conc, rate, implausible, range }: { conc: string; rate: number | null; implausible: boolean; range: string }) => (
  <View style={[s.resultBox, implausible && { borderColor: C.amber }]}>
    <Text style={s.small}>Velocidade de infusão</Text>
    <Text style={{ color: C.text, fontSize: 26, fontWeight: '800' }}>{rate == null ? '--' : rate} mL/h</Text>
    <Text style={s.small}>Concentração: {conc}</Text>
    <Text style={{ color: implausible ? C.amber : C.greenL, fontSize: 12, marginTop: 6, fontWeight: '600' }}>
      {implausible ? `⚠️ Fora da faixa usual (${range}). Confira a diluição.` : '✓ Concentração dentro da faixa usual.'}
    </Text>
  </View>
);

/* ---------- Término ---------- */
export function TerminationScreen() {
  const { code, setTerm, totalSec } = useCode();
  if (!code) return null;
  const t = code.term;
  const durMin = Math.floor(totalSec() / 60);
  const Toggle = ({ k, yes, no }: { k: 'shockable' | 'pocus'; yes: string; no: string }) => (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {(['yes', 'no'] as const).map((v) => (
        <TouchableOpacity key={v} style={[s.seg, t[k] === v && { borderColor: v === 'yes' ? C.red : C.greenL, backgroundColor: v === 'yes' ? 'rgba(220,38,38,.2)' : 'rgba(34,197,94,.2)' }]} onPress={() => setTerm({ [k]: t[k] === v ? null : v } as any)}>
          <Text style={{ color: C.text, fontSize: 12, fontWeight: '700' }}>{v === 'yes' ? yes : no}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
  return (
    <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 30 }}>
      <Text style={s.h2}>Apoio à decisão de término</Text>
      <View style={s.card}>
        <Row label="Duração da parada" right={<Text style={{ color: C.text, fontWeight: '800' }}>{fmt(totalSec())}{durMin >= 20 ? ' (≥20m)' : ''}</Text>} />
        <Row label="Ritmo chocável recente?" right={<Toggle k="shockable" yes="Sim" no="Não" />} />
        <Row label="POCUS — contração" right={<Toggle k="pocus" yes="Presente" no="Ausente" />} />
        <Row label="EtCO₂ (mmHg) — manual" right={<TextInput style={[s.input, { width: 80, textAlign: 'center' }]} keyboardType="numeric" value={t.etco2} onChangeText={(v) => setTerm({ etco2: v })} placeholder="--" placeholderTextColor={C.muted} />} />
      </View>
      <Text style={[s.small, { marginTop: 12 }]}>O app não decide pelo profissional: apenas organiza âncoras objetivas (duração, ritmo chocável, POCUS, EtCO₂) para sustentar a decisão de continuar ou suspender.</Text>
    </ScrollView>
  );
}
const Row = ({ label, right }: { label: string; right: React.ReactNode }) => (
  <View style={s.anchor}><Text style={{ color: C.text, flex: 1 }}>{label}</Text>{right}</View>
);

/* ---------- Linha do tempo ---------- */
export function TimelineScreen() {
  const { code } = useCode();
  if (!code) return null;
  return (
    <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 30 }}>
      <Text style={s.h2}>Linha do tempo</Text>
      {!code.events.length && <Text style={s.small}>Nenhum evento registrado.</Text>}
      {code.events.slice().reverse().map((e, i) => (
        <View key={i} style={s.tlItem}>
          <Text style={{ color: C.muted, width: 54, fontWeight: '700' }}>{fmt((e.t - code.startTime) / 1000)}</Text>
          <Text style={{ color: C.text, flex: 1 }}>{e.label}{e.meta ? '  ·  ' + e.meta : ''}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

/* ---------- Equipe ---------- */
export function TeamScreen() {
  const [team, setTeam] = useState<TeamState>(emptyTeam());
  const [name, setName] = useState('');
  useEffect(() => { loadTeam().then(setTeam); }, []);
  const persist = (t: TeamState) => { setTeam(t); saveTeam(t); };
  const rolesCount = (id: string) => ROLES.filter((r) => team.roles[r.id] === id).length;
  return (
    <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 30 }}>
      <Text style={s.h2}>Check-in da equipe</Text>
      <View style={s.rowG}>
        <TextInput style={[s.input, { flex: 1 }]} placeholder="Nome do membro" placeholderTextColor={C.muted} value={name} onChangeText={setName} />
        <TouchableOpacity style={s.addBtn} onPress={() => { if (!name.trim()) return; persist({ ...team, members: [...team.members, { id: 'm' + Date.now(), name: name.trim() }] }); setName(''); }}><Text style={{ color: '#fff', fontWeight: '700' }}>Check-in</Text></TouchableOpacity>
      </View>
      {team.members.map((m) => (
        <View key={m.id} style={s.anchor}>
          <Text style={{ color: C.text, flex: 1 }}>{m.name}</Text>
          <Text style={[s.small, { color: C.greenL }]}>{ROLES.filter((r) => team.roles[r.id] === m.id).map((r) => r.name).join(', ')}</Text>
          <TouchableOpacity onPress={() => persist({ ...team, members: team.members.filter((x) => x.id !== m.id), roles: Object.fromEntries(Object.entries(team.roles).filter(([, v]) => v !== m.id)) })}><Text style={{ color: '#f87171', marginLeft: 10 }}>✕</Text></TouchableOpacity>
        </View>
      ))}
      <Text style={s.h2}>Designação de funções</Text>
      {ROLES.map((r) => (
        <View key={r.id} style={s.anchor}>
          <Text style={{ color: C.text, flex: 1 }}>{r.name}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Chip on={!team.roles[r.id]} label="—" onPress={() => { const roles = { ...team.roles }; delete roles[r.id]; persist({ ...team, roles }); }} />
            {team.members.map((m) => (
              <Chip key={m.id} on={team.roles[r.id] === m.id} label={m.name} onPress={() => {
                if (team.roles[r.id] !== m.id && rolesCount(m.id) >= 2) { Alert.alert('Limite', 'Máximo de 2 funções por membro.'); return; }
                persist({ ...team, roles: { ...team.roles, [r.id]: m.id } });
              }} />
            ))}
          </ScrollView>
        </View>
      ))}
      <Text style={[s.small, { marginTop: 12 }]}>Um membro pode acumular até 2 funções (times incompletos).</Text>
    </ScrollView>
  );
}
const Chip = ({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) => (
  <TouchableOpacity onPress={onPress} style={[s.chip, on && { backgroundColor: 'rgba(34,197,94,.3)' }]}><Text style={{ color: C.text, fontWeight: '700' }}>{label}</Text></TouchableOpacity>
);

/* ---------- Debrief ---------- */
export function DebriefModal({ m, outcome, onClose }: { m: Metrics; outcome: string; onClose: () => void }) {
  const label = outcome === 'rosc' ? 'RCE sustentado' : outcome === 'death' ? 'Óbito' : outcome === 'transfer' ? 'Transferido em RCP' : 'Outro';
  const box = (v: string | number, l: string) => (<View style={s.mBox}><Text style={{ color: C.text, fontSize: 20, fontWeight: '800' }}>{v}</Text><Text style={s.small}>{l}</Text></View>);
  return (
    <Modal animationType="slide" onRequestClose={onClose}>
      <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 20, paddingTop: 50 }}>
        <Text style={{ color: C.text, fontSize: 20, fontWeight: '800', marginBottom: 4 }}>Hot debrief</Text>
        <Text style={[s.small, { marginBottom: 12 }]}>Desfecho: {label}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {box(fmt(m.dur), 'Duração')}
          {box(m.ccf == null ? '--' : Math.round(m.ccf) + '%', 'Fração compr.')}
          {box(m.timeToShock == null ? '—' : fmt(m.timeToShock), '1º choque')}
          {box(m.timeToEpi == null ? '—' : fmt(m.timeToEpi), '1ª adrenalina')}
          {box(m.shocks, 'Choques')}
          {box(m.epis, 'Doses adren.')}
        </View>
        {m.periShock != null && <Text style={[s.small, { marginTop: 10 }]}>Maior pausa peri-choque: {Math.round(m.periShock)} s</Text>}
        <Text style={[s.small, { marginTop: 12 }]}>Indicadores salvos no banco local (recuperáveis para auditoria/QI). Exportação PDF/CSV: portar via lib nativa (ex.: react-native-share).</Text>
        <TouchableOpacity style={[s.sheetBtn, { marginTop: 20 }]} onPress={onClose}><Text style={s.sheetBtnTxt}>Concluir</Text></TouchableOpacity>
      </ScrollView>
    </Modal>
  );
}

const s = StyleSheet.create({
  body: { flex: 1, paddingHorizontal: 14 },
  h2: { color: C.muted, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 16, marginBottom: 8, fontWeight: '700' },
  small: { color: C.muted, fontSize: 12 },
  timers: { flexDirection: 'row', gap: 6, marginTop: 8 },
  tmr: { flex: 1, backgroundColor: C.panel, borderRadius: 12, padding: 8, alignItems: 'center' },
  tmrV: { color: C.text, fontSize: 22, fontWeight: '800' },
  push: { color: C.text, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 10, marginTop: 8, fontWeight: '700', textAlign: 'center' },
  row3: { flexDirection: 'row', gap: 8 },
  rowG: { flexDirection: 'row', gap: 8, alignItems: 'stretch', marginTop: 10 },
  rhythmBtn: { flex: 1, borderWidth: 2, borderColor: C.line, backgroundColor: C.panel, borderRadius: 14, padding: 12, alignItems: 'center' },
  rhythmTxt: { fontWeight: '800', fontSize: 15 },
  compBtn: { flex: 1, borderWidth: 2, borderRadius: 14, padding: 12, alignItems: 'center', justifyContent: 'center' },
  ccfBox: { width: 120, backgroundColor: C.panel, borderRadius: 14, padding: 8, alignItems: 'center', borderWidth: 1, borderColor: C.line },
  metroBtn: { flex: 1, borderWidth: 2, borderColor: C.line, backgroundColor: C.panel2, borderRadius: 14, padding: 12, alignItems: 'center' },
  adj: { width: 56, borderWidth: 1, borderColor: C.line, backgroundColor: C.panel2, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  adjTxt: { color: C.text, fontSize: 26, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  act: { width: '47.5%', backgroundColor: C.panel2, borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 14, alignItems: 'center' },
  roscBtn: { backgroundColor: C.green, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 14 },
  endBtn: { borderWidth: 1, borderColor: C.red, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 10 },
  card: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 12, marginBottom: 8 },
  letter: { width: 28, height: 28, borderRadius: 8, backgroundColor: C.panel2, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  tag: { color: C.muted, fontSize: 11, fontWeight: '700' },
  conduct: { color: '#cbd5e1', backgroundColor: C.panel2, borderRadius: 10, padding: 10, lineHeight: 19, marginBottom: 10 },
  seg: { flex: 1, borderWidth: 1, borderColor: C.line, backgroundColor: C.panel2, borderRadius: 10, padding: 10, alignItems: 'center' },
  bundle: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderColor: C.line },
  box: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: C.muted, alignItems: 'center', justifyContent: 'center' },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  preset: { backgroundColor: C.panel2, borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingVertical: 8, paddingHorizontal: 12 },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 10, color: C.text, backgroundColor: C.bg, fontSize: 16 },
  resultBox: { backgroundColor: C.panel2, borderRadius: 12, padding: 14, marginTop: 8, borderWidth: 1, borderColor: C.line },
  anchor: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: C.line },
  tlItem: { flexDirection: 'row', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderColor: C.line },
  chip: { paddingVertical: 8, paddingHorizontal: 12, marginRight: 6, borderRadius: 16, backgroundColor: 'rgba(127,127,127,.2)' },
  addBtn: { backgroundColor: C.red, borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.6)', justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: C.panel, borderRadius: 16, padding: 16 },
  sheetTitle: { color: C.text, fontSize: 16, fontWeight: '800', marginBottom: 12 },
  sheetBtn: { backgroundColor: C.panel2, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 8 },
  sheetBtnTxt: { color: C.text, fontWeight: '700' },
  mBox: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 12, alignItems: 'center', minWidth: 100 },
});
