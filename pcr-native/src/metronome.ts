/**
 * Metrônomo de compressões (100–120/min, padrão 110).
 *
 * NOTA: o React Native não tem WebAudio. Este módulo bate via Vibration
 * (funciona sem wiring nativo). Para um CLIQUE AUDÍVEL, instale uma lib de
 * áudio (ex.: react-native-sound ou expo-av) e dispare o som dentro de tick().
 * Marcado com TODO abaixo.
 */
import { Vibration } from 'react-native';

let timer: ReturnType<typeof setInterval> | null = null;
let bpm = 110;
let onState = false;

export function getBpm() { return bpm; }
export function isOn() { return onState; }

export function setBpm(v: number) {
  bpm = Math.max(100, Math.min(120, Math.round(v)));
  if (onState) { stop(); start(); }
  return bpm;
}

function tick() {
  Vibration.vibrate(35);
  // TODO(áudio): tocar um clique curto aqui via react-native-sound/expo-av.
}

export function start() {
  if (onState) return;
  onState = true;
  tick();
  timer = setInterval(tick, (60 / bpm) * 1000);
}

export function stop() {
  onState = false;
  if (timer) { clearInterval(timer); timer = null; }
}

export function toggle() { onState ? stop() : start(); return onState; }
