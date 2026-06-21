/** Helpers de formatação e cálculo (porte de pcr/app.js). */
export function fmt(sec: number): string {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}
export function fmtSigned(sec: number): string {
  return (sec < 0 ? '+' : '') + fmt(Math.abs(sec));
}
export function round(n: number, d: number): number {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

export interface InfusionResult {
  conc: number;        // concentração (mcg/mL p/ nora; mg/mL p/ amio)
  rate: number | null; // mL/h
  implausible: boolean;
}

/** Noradrenalina: dose mcg/kg/min, peso kg → mL/h. Concentração em mcg/mL. */
export function calcNora(massMg: number, volMl: number, weightKg: number, doseMcgKgMin: number, range: { min: number; max: number }): InfusionResult {
  const conc = (massMg * 1000) / volMl; // mcg/mL
  const implausible = conc < range.min || conc > range.max;
  let rate: number | null = null;
  if (weightKg > 0 && doseMcgKgMin >= 0) rate = round((doseMcgKgMin * weightKg * 60) / conc, 1);
  return { conc: round(conc, 1), rate, implausible };
}

/** Amiodarona: dose mg/min → mL/h. Concentração em mg/mL. */
export function calcAmio(massMg: number, volMl: number, doseMgMin: number, range: { min: number; max: number }): InfusionResult {
  const conc = massMg / volMl; // mg/mL
  const implausible = conc < range.min || conc > range.max;
  let rate: number | null = null;
  if (doseMgMin >= 0) rate = round((doseMgMin * 60) / conc, 1);
  return { conc: round(conc, 2), rate, implausible };
}
