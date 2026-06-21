/**
 * Conteúdo clínico estruturado (porte de pcr/data.js). Diretrizes AHA ACLS /
 * ERC e diretrizes brasileiras de RCP. USO EXCLUSIVAMENTE ADULTO.
 */
export interface Role { id: string; name: string; }
export interface Member { id: string; name: string; }
export interface TeamState { shiftDate: string; members: Member[]; roles: Record<string, string>; }

export const ROLES: Role[] = [
  { id: 'lider', name: 'Líder' },
  { id: 'viaAerea', name: 'Via Aérea' },
  { id: 'comp1', name: 'Compressão - 1º' },
  { id: 'comp2', name: 'Compressão - 2º' },
  { id: 'monitor', name: 'Monitorização/Desfibrilação' },
  { id: 'medicacao', name: 'Medicamentos' },
];

export interface Cause { id: string; letter: string; name: string; hint: string; conduct: string; }
export const CAUSES: Cause[] = [
  { id: 'hipoxia', letter: 'H', name: 'Hipóxia', hint: 'oxigenação / via aérea', conduct: 'Garantir via aérea pérvia e oxigenação com O₂ a 100%. Confirmar posicionamento do tubo/dispositivo (capnografia, ausculta), expansibilidade simétrica e ventilação eficaz. Tratar broncoespasmo/obstrução.' },
  { id: 'hipovolemia', letter: 'H', name: 'Hipovolemia', hint: 'volume / hemorragia', conduct: 'Infusão volêmica em bolus (cristaloide aquecido). Controlar hemorragia ativa; considerar hemoderivados no trauma/sangramento. Investigar perdas ocultas (TGI, retroperitônio, gravidez ectópica).' },
  { id: 'hidrogenio', letter: 'H', name: 'Hidrogênio (acidose)', hint: 'acidose metabólica', conduct: 'Otimizar ventilação. Bicarbonato de sódio (1 mEq/kg) em acidose metabólica grave documentada, hipercalemia ou intoxicação por antidepressivo tricíclico. Tratar a causa de base.' },
  { id: 'potassio', letter: 'H', name: 'Hipo / Hipercalemia', hint: 'distúrbio do K⁺', conduct: 'HIPERcalemia: cálcio (gluconato/cloreto) IV, bicarbonato, insulina regular + glicose, salbutamol; considerar diálise. HIPOcalemia: repor K⁺ IV com cautela e corrigir Mg²⁺.' },
  { id: 'hipotermia', letter: 'H', name: 'Hipotermia', hint: 'temperatura central', conduct: '"Não está morto até estar quente e morto." Reaquecimento ativo (ideal ECMO/CEC). RCP prolongada. Se T < 30 °C: limitar a 3 choques e suspender drogas até reaquecer.' },
  { id: 'pneumotorax', letter: 'T', name: 'Tensão — pneumotórax hipertensivo', hint: 'descompressão', conduct: 'Sinais: ausência de MV, hipertimpanismo, desvio de traqueia, turgência jugular. Descompressão imediata por agulha (2º EIC linha hemiclavicular ou 4º/5º EIC linha axilar média) seguida de drenagem torácica.' },
  { id: 'tamponamento', letter: 'T', name: 'Tamponamento cardíaco', hint: 'pericardiocentese', conduct: 'USG: derrame pericárdico com colapso de câmaras. Pericardiocentese guiada por ultrassom (acesso subxifoide). Toracotomia de reanimação se trauma penetrante.' },
  { id: 'toxinas', letter: 'T', name: 'Toxinas', hint: 'antídotos', conduct: 'Identificar agente. Antídoto específico (ver Circunstâncias especiais → Intoxicações). Emulsão lipídica na toxicidade por anestésico local; naloxona em opioides; bicarbonato em tricíclicos.' },
  { id: 'trombose_cor', letter: 'T', name: 'Trombose coronariana (IAM)', hint: 'cateterismo', conduct: 'Causa frequente de FV/TV. Após RCE: ECG de 12 derivações imediato e ativação da hemodinâmica para cateterismo/angioplastia primária. Considerar reperfusão.' },
  { id: 'tep', letter: 'T', name: 'Tromboembolismo pulmonar', hint: 'trombólise', conduct: 'Suspeita: AESP, distensão de VD ao USG, fatores de risco. Considerar trombólise (ex.: alteplase 50 mg IV) e RCP prolongada (60–90 min). Considerar trombectomia/ECMO.' },
];

export interface Special { id: string; title: string; sub: string; body: string[]; }
export const SPECIAL: Special[] = [
  { id: 'hipercalemia', title: 'Hipercalemia', sub: 'a causa mais reversível e mais esquecida', body: [
    'Suspeitar em DRC, diálise, rabdomiólise, acidose, drogas (IECA, espironolactona). Tratar empiricamente se forte suspeita.',
    'Cálcio — gluconato de cálcio 10% 10–30 mL IV (ou cloreto de cálcio 10% 10 mL), estabiliza a membrana. Repetir se necessário.',
    'Bicarbonato de sódio — 1 mEq/kg IV (50 mEq), sobretudo se acidose.',
    'Insulina regular 10 U IV + glicose — 25 g (50 mL de glicose a 50%). Monitorar glicemia.',
    'Salbutamol inalatório em dose alta (adjuvante).',
    'Diálise de urgência — tratamento definitivo; acionar nefrologia precocemente.',
  ] },
  { id: 'tep', title: 'TEP maciço', sub: 'trombólise e RCP prolongada', body: [
    'Considerar em AESP com VD distendido ao POCUS, TVP, pós-operatório, câncer.',
    'Trombólise: alteplase 50 mg IV em bolus; pode repetir 50 mg. (Alternativa: tenecteplase por peso.)',
    'Manter RCP por 60–90 min após o trombolítico antes de considerar término.',
    'Considerar trombectomia (cirúrgica/cateter) ou ECMO se disponível.',
  ] },
  { id: 'last', title: 'Intoxicação por anestésico local (LAST)', sub: 'emulsão lipídica', body: [
    'Suspeitar após bloqueio/infiltração com bupivacaína, lidocaína etc.',
    'Emulsão lipídica 20%: bolus de 1,5 mL/kg (peso magro) em 2–3 min (≈100 mL no adulto).',
    'Infusão: 0,25 mL/kg/min; aumentar para 0,5 se instável.',
    'Repetir o bolus 1–2× se persistir colapso. Dose máxima ≈ 12 mL/kg.',
    'Evitar altas doses de adrenalina (usar < 1 mcg/kg), vasopressina, BCC e betabloqueadores.',
  ] },
  { id: 'gestante', title: 'Gestante', sub: 'desvio uterino e cesárea perimortem', body: [
    'Desvio uterino manual para a esquerda (deslocar o útero, aliviando a compressão da cava) — mais eficaz que inclinar a paciente.',
    'Compressões com as mãos levemente mais altas no esterno.',
    'Via aérea precoce (maior risco de aspiração e via aérea difícil).',
    'Cesárea perimortem: se útero ≥ cicatriz umbilical (≈ 20 sem) e sem RCE em 4 min — extração fetal em até 5 min do início da parada.',
  ] },
  { id: 'hipotermia', title: 'Hipotermia', sub: '"não está morto até estar quente e morto"', body: [
    'Medir temperatura central. RCP prolongada — sobrevida possível mesmo após tempos longos.',
    'Se T < 30 °C: limitar a 3 choques e suspender drogas até reaquecer.',
    'Se T 30–35 °C: espaçar o intervalo das drogas (dobrar).',
    'Reaquecimento ativo — ideal extracorpóreo (ECMO/CEC); alternativas: lavagens aquecidas, ar/fluidos aquecidos.',
  ] },
  { id: 'pneumotorax', title: 'Pneumotórax hipertensivo', sub: 'descompressão imediata', body: [
    'Sinais: ausência de murmúrio, hipertimpanismo, desvio de traqueia, turgência jugular, resistência à ventilação.',
    'Descompressão por agulha imediata: 2º EIC na linha hemiclavicular ou 4º/5º EIC na linha axilar média.',
    'Seguir com drenagem torácica definitiva.',
  ] },
  { id: 'tamponamento', title: 'Tamponamento cardíaco', sub: 'pericardiocentese', body: [
    'POCUS: derrame pericárdico com colapso diastólico de câmaras direitas.',
    'Pericardiocentese guiada por ultrassom (acesso subxifoide).',
    'Toracotomia de reanimação se trauma penetrante torácico.',
  ] },
  { id: 'intox', title: 'Intoxicações (genérico)', sub: 'antídotos relevantes', body: [
    'Opioides → naloxona 0,4–2 mg IV/IM, repetir.',
    'Tricíclicos (QRS largo) → bicarbonato de sódio.',
    'Betabloqueador / BCC → cálcio, glucagon, insulina em altas doses + glicose; vasopressores.',
    'Digoxina → anticorpo antidigoxina (Fab).',
    'Anestésico local → emulsão lipídica (ver LAST).',
    'Benzodiazepínicos → flumazenil (cautela: risco de convulsão).',
    'Monóxido de carbono → O₂ 100% / câmara hiperbárica. Cianeto → hidroxocobalamina.',
  ] },
];

export interface BundleItem { id: string; title: string; sub: string; }
export const BUNDLE: BundleItem[] = [
  { id: 'ecg', title: 'ECG de 12 derivações', sub: 'ativar hemodinâmica/cateterismo se IAM' },
  { id: 'pam', title: 'Alvo de PAM ≥ 65 mmHg', sub: 'fluidos e vasopressor conforme necessário' },
  { id: 'spo2', title: 'SpO₂ 92–98% — evitar hiperóxia', sub: 'titular FiO₂' },
  { id: 'paco2', title: 'PaCO₂ 35–45 mmHg — evitar hipocapnia', sub: 'ajustar ventilação' },
  { id: 'ttm', title: 'Controle direcionado de temperatura', sub: 'TTM 32–37,5 °C; evitar febre ativamente' },
  { id: 'glic', title: 'Controle glicêmico', sub: 'evitar hipo e hiperglicemia' },
  { id: 'eeg', title: 'Vigilância de convulsão / EEG', sub: 'tratar crises; considerar monitorização' },
  { id: 'causa', title: 'Identificar e tratar a causa', sub: 'manter abordagem dos 5H e 5T' },
];

export interface Preset { label: string; mass: number; vol: number; }
export const NORA_PRESETS: Preset[] = [
  { label: '4 mg / 250 mL', mass: 4, vol: 250 },
  { label: '8 mg / 250 mL', mass: 8, vol: 250 },
  { label: '16 mg / 250 mL', mass: 16, vol: 250 },
  { label: '16 mg / 100 mL', mass: 16, vol: 100 },
];
export const NORA_CONC_RANGE = { min: 8, max: 160 }; // mcg/mL
export const AMIO_PRESETS: Preset[] = [
  { label: '900 mg / 500 mL', mass: 900, vol: 500 },
  { label: '450 mg / 250 mL', mass: 450, vol: 250 },
  { label: '600 mg / 500 mL', mass: 600, vol: 500 },
];
export const AMIO_CONC_RANGE = { min: 0.9, max: 3 }; // mg/mL

export const CYCLE_SEC = 120;
export const EPI_INTERVAL_SEC = 240;
export const CAUSE_NUDGE_SEC = 240;
