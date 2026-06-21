/**
 * Motor do código (porte de pcr/app.js para React): cronômetros (total / ciclo
 * 2 min / adrenalina), registro de eventos, fração de compressão, causas,
 * bundle, RCE, término, métricas e recuperação automática (AsyncStorage).
 */
import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { Vibration } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CYCLE_SEC, EPI_INTERVAL_SEC } from './clinicalData';

const SESSION_KEY = 'pcr_session';
const HISTORY_KEY = 'pcr_history';

export interface CodeEvent { t: number; type: string; label: string; meta?: string; }
export interface Pause { start: number; end: number | null; }
export interface TermState { shockable: 'yes' | 'no' | null; pocus: 'yes' | 'no' | null; etco2: string; }
export interface CodeState {
  id: string; startTime: number; ended: boolean; endTime?: number; outcome?: string;
  rhythm: string | null; shockable: boolean;
  events: CodeEvent[]; cycleStart: number; lastEpi: number | null;
  compRunning: boolean; pauses: Pause[];
  causes: Record<string, 'considered' | 'discarded' | 'treating'>;
  bundle: Record<string, boolean>;
  rosc: boolean; roscTime: number | null;
  term: TermState;
}

export interface Metrics {
  dur: number; ccf: number | null; timeToShock: number | null; timeToEpi: number | null;
  shocks: number; epis: number; periShock: number | null; events: number;
}

function blank(): CodeState {
  const now = Date.now();
  return {
    id: 'pcr_' + now, startTime: now, ended: false,
    rhythm: null, shockable: false, events: [],
    cycleStart: now, lastEpi: null, compRunning: true, pauses: [],
    causes: {}, bundle: {}, rosc: false, roscTime: null,
    term: { shockable: null, pocus: null, etco2: '' },
  };
}

interface Ctx {
  code: CodeState | null; now: number; recovered: CodeState | null;
  start: () => void; recover: () => void; discardRecovered: () => void;
  setRhythm: (r: string, shockable: boolean) => void;
  log: (type: string, label: string, meta?: string) => void;
  undo: () => void;
  epi: () => void; shock: () => void; pulse: (withPulse: boolean) => void;
  toggleComp: () => void; newCycle: () => void;
  setCause: (id: string, v: 'considered' | 'discarded' | 'treating') => void;
  toggleBundle: (id: string) => void;
  markRosc: () => void; setTerm: (patch: Partial<TermState>) => void;
  end: (outcome: string) => Metrics; reset: () => void;
  totalSec: () => number; cycleRem: () => number; epiElapsed: () => number | null; ccf: () => number | null;
  metrics: () => Metrics;
}

const CodeCtx = createContext<Ctx | null>(null);
export const useCode = (): Ctx => {
  const c = useContext(CodeCtx);
  if (!c) throw new Error('useCode fora do CodeProvider');
  return c;
};

export const CodeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [code, setCode] = useState<CodeState | null>(null);
  const [recovered, setRecovered] = useState<CodeState | null>(null);
  const [now, setNow] = useState<number>(Date.now());
  const flags = useRef({ cycleOver: false, epiDue: false });

  // recuperação de sessão
  useEffect(() => {
    AsyncStorage.getItem(SESSION_KEY).then((r) => {
      if (!r) return;
      try { const s: CodeState = JSON.parse(r); if (s && !s.ended) setRecovered(s); } catch {}
    });
  }, []);

  // persistência (em mudanças significativas, não a cada tick)
  useEffect(() => {
    if (!code) return;
    AsyncStorage.setItem(SESSION_KEY, JSON.stringify(code));
  }, [code]);

  // tick dos cronômetros
  useEffect(() => {
    if (!code || code.ended) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [code]);

  // alertas (vibração) ao cruzar limites
  useEffect(() => {
    if (!code || code.ended) return;
    const cr = CYCLE_SEC - (now - code.cycleStart) / 1000;
    if (cr <= 0 && !flags.current.cycleOver) { flags.current.cycleOver = true; Vibration.vibrate([0, 120, 60, 120]); }
    if (cr > 0) flags.current.cycleOver = false;
    if (code.lastEpi != null) {
      const ee = (now - code.lastEpi) / 1000;
      if (ee >= EPI_INTERVAL_SEC && !flags.current.epiDue) { flags.current.epiDue = true; Vibration.vibrate([0, 120, 60, 120]); }
      if (ee < EPI_INTERVAL_SEC) flags.current.epiDue = false;
    }
  }, [now, code]);

  const patch = useCallback((fn: (s: CodeState) => CodeState) => {
    setCode((prev) => (prev ? fn(prev) : prev));
  }, []);

  const log = useCallback((type: string, label: string, meta?: string) => {
    patch((s) => ({ ...s, events: [...s.events, { t: Date.now(), type, label, meta }] }));
  }, [patch]);

  const newCycle = useCallback(() => { flags.current.cycleOver = false; patch((s) => ({ ...s, cycleStart: Date.now() })); }, [patch]);

  const ctx: Ctx = {
    code, now, recovered,
    start: () => { setRecovered(null); setCode(blank()); },
    recover: () => { if (recovered) { setCode(recovered); setRecovered(null); } },
    discardRecovered: () => { setRecovered(null); AsyncStorage.removeItem(SESSION_KEY); },

    setRhythm: (r, shockable) => patch((s) => {
      const first = s.events.filter((e) => e.type === 'rhythm').length === 0;
      return {
        ...s, rhythm: r, shockable,
        cycleStart: first ? Date.now() : s.cycleStart,
        events: [...s.events, { t: Date.now(), type: 'rhythm', label: 'Ritmo: ' + r, meta: shockable ? 'chocável' : 'não-chocável' }],
      };
    }),
    log,
    undo: () => patch((s) => {
      if (!s.events.length) return s;
      const events = s.events.slice(0, -1);
      const le = events.filter((e) => e.type === 'epi').pop();
      return { ...s, events, lastEpi: le ? le.t : null };
    }),
    epi: () => { flags.current.epiDue = false; patch((s) => ({ ...s, lastEpi: Date.now(), events: [...s.events, { t: Date.now(), type: 'epi', label: 'Adrenalina 1 mg IV/IO' }] })); },
    shock: () => log('shock', 'Choque / desfibrilação'),
    pulse: (withPulse) => {
      log('pulse', 'Checagem de ritmo: ' + (withPulse ? 'COM pulso' : 'SEM pulso'), withPulse ? 'avaliar RCE' : 'manter RCP');
      if (!withPulse) newCycle();
    },
    toggleComp: () => patch((s) => {
      if (s.compRunning) return { ...s, compRunning: false, pauses: [...s.pauses, { start: Date.now(), end: null }], events: [...s.events, { t: Date.now(), type: 'pause', label: 'Compressões pausadas' }] };
      const pauses = s.pauses.slice();
      const open = pauses[pauses.length - 1];
      if (open && open.end == null) open.end = Date.now();
      return { ...s, compRunning: true, pauses, events: [...s.events, { t: Date.now(), type: 'resume', label: 'Compressões retomadas' }] };
    }),
    newCycle,
    setCause: (id, v) => patch((s) => {
      const causes = { ...s.causes };
      if (causes[id] === v) delete causes[id]; else causes[id] = v;
      const lbl = v === 'considered' ? 'Considerada' : v === 'discarded' ? 'Descartada' : 'Em tratamento';
      return { ...s, causes, events: [...s.events, { t: Date.now(), type: 'cause', label: id + ': ' + (causes[id] ? lbl : 'reaberta') }] };
    }),
    toggleBundle: (id) => patch((s) => {
      const bundle = { ...s.bundle };
      if (bundle[id]) delete bundle[id]; else bundle[id] = true;
      return { ...s, bundle };
    }),
    markRosc: () => patch((s) => s.rosc ? s : ({ ...s, rosc: true, roscTime: Date.now(), events: [...s.events, { t: Date.now(), type: 'rosc', label: 'RCE — retorno da circulação espontânea' }] })),
    setTerm: (p) => patch((s) => ({ ...s, term: { ...s.term, ...p } })),

    end: (outcome) => {
      const s = code!;
      const ended: CodeState = { ...s, ended: true, endTime: Date.now(), outcome };
      if (!ended.compRunning) { const last = ended.pauses[ended.pauses.length - 1]; if (last && last.end == null) last.end = Date.now(); }
      const m = computeMetrics(ended, ended.endTime!);
      AsyncStorage.getItem(HISTORY_KEY).then((r) => {
        const hist = r ? JSON.parse(r) : [];
        hist.unshift({ id: s.id, ts: s.startTime, endTs: ended.endTime, outcome, metrics: m, rhythm: s.rhythm });
        AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(hist.slice(0, 200)));
      });
      AsyncStorage.removeItem(SESSION_KEY);
      setCode(ended);
      return m;
    },
    reset: () => { setCode(null); AsyncStorage.removeItem(SESSION_KEY); },

    totalSec: () => code ? (now - code.startTime) / 1000 : 0,
    cycleRem: () => code ? CYCLE_SEC - (now - code.cycleStart) / 1000 : CYCLE_SEC,
    epiElapsed: () => code && code.lastEpi != null ? (now - code.lastEpi) / 1000 : null,
    ccf: () => code ? ccfOf(code, now) : null,
    metrics: () => computeMetrics(code!, now),
  };

  return <CodeCtx.Provider value={ctx}>{children}</CodeCtx.Provider>;
};

function pausedSeconds(s: CodeState, at: number): number {
  return s.pauses.reduce((sum, p) => sum + ((p.end || at) - p.start) / 1000, 0);
}
function ccfOf(s: CodeState, at: number): number | null {
  const t = (at - s.startTime) / 1000;
  if (t <= 0) return null;
  return Math.max(0, Math.min(100, ((t - pausedSeconds(s, at)) / t) * 100));
}
export function computeMetrics(s: CodeState, at: number): Metrics {
  const ev = s.events;
  const firstShock = ev.find((e) => e.type === 'shock');
  const firstEpi = ev.find((e) => e.type === 'epi');
  const shockTimes = ev.filter((e) => e.type === 'shock').map((e) => e.t);
  let periShock: number | null = null;
  if (shockTimes.length && s.pauses.length) {
    let max = 0, found = false;
    s.pauses.forEach((p) => {
      const end = p.end || at;
      shockTimes.forEach((st) => { if (st >= p.start - 10000 && st <= end + 10000) { found = true; const len = (end - p.start) / 1000; if (len > max) max = len; } });
    });
    if (found) periShock = max;
  }
  return {
    dur: (at - s.startTime) / 1000,
    ccf: ccfOf(s, at),
    timeToShock: firstShock ? (firstShock.t - s.startTime) / 1000 : null,
    timeToEpi: firstEpi ? (firstEpi.t - s.startTime) / 1000 : null,
    shocks: shockTimes.length,
    epis: ev.filter((e) => e.type === 'epi').length,
    periShock, events: ev.length,
  };
}
