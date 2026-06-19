/* =========================================================================
 * Conteúdo clínico estruturado e versionável (diretrizes AHA ACLS / ERC e
 * diretrizes brasileiras de RCP). Separado da lógica para facilitar a
 * atualização quando as diretrizes mudarem. USO EXCLUSIVAMENTE ADULTO.
 * ========================================================================= */
window.PCR_DATA = {
  version: '2026.1',

  /* ---- 5H e 5T: causas reversíveis ---- */
  causes: [
    { id: 'hipoxia', letter: 'H', name: 'Hipóxia', hint: 'oxigenação / via aérea',
      conduct: 'Garantir via aérea pérvia e oxigenação com O₂ a 100%. Confirmar posicionamento do tubo/dispositivo (capnografia, ausculta), expansibilidade simétrica e ventilação eficaz. Tratar broncoespasmo/obstrução.' },
    { id: 'hipovolemia', letter: 'H', name: 'Hipovolemia', hint: 'volume / hemorragia',
      conduct: 'Infusão volêmica em bolus (cristaloide aquecido). Controlar hemorragia ativa; considerar hemoderivados no trauma/sangramento. Investigar perdas ocultas (TGI, retroperitônio, gravidez ectópica).' },
    { id: 'hidrogenio', letter: 'H', name: 'Hidrogênio (acidose)', hint: 'acidose metabólica',
      conduct: 'Otimizar ventilação. Bicarbonato de sódio (1 mEq/kg) em acidose metabólica grave documentada, hipercalemia ou intoxicação por antidepressivo tricíclico. Tratar a causa de base.' },
    { id: 'potassio', letter: 'H', name: 'Hipo / Hipercalemia', hint: 'distúrbio do K⁺',
      conduct: 'HIPERcalemia: cálcio (gluconato/cloreto) IV, bicarbonato, insulina regular + glicose, salbutamol; considerar diálise. HIPOcalemia: repor K⁺ IV com cautela e corrigir Mg²⁺.' },
    { id: 'hipotermia', letter: 'H', name: 'Hipotermia', hint: 'temperatura central',
      conduct: '"Não está morto até estar quente e morto." Reaquecimento ativo (ideal ECMO/CEC). RCP prolongada. Se T < 30 °C: limitar a 3 choques e suspender drogas até reaquecer.' },
    { id: 'pneumotorax', letter: 'T', name: 'Tensão — pneumotórax hipertensivo', hint: 'descompressão',
      conduct: 'Sinais: ausência de MV, hipertimpanismo, desvio de traqueia, turgência jugular. Descompressão imediata por agulha (2º EIC linha hemiclavicular ou 4º/5º EIC linha axilar média) seguida de drenagem torácica.' },
    { id: 'tamponamento', letter: 'T', name: 'Tamponamento cardíaco', hint: 'pericardiocentese',
      conduct: 'USG: derrame pericárdico com colapso de câmaras. Pericardiocentese guiada por ultrassom (acesso subxifoide). Toracotomia de reanimação se trauma penetrante.' },
    { id: 'toxinas', letter: 'T', name: 'Toxinas', hint: 'antídotos',
      conduct: 'Identificar agente. Antídoto específico (ver Circunstâncias especiais → Intoxicações). Emulsão lipídica na toxicidade por anestésico local; naloxona em opioides; bicarbonato em tricíclicos.' },
    { id: 'trombose_cor', letter: 'T', name: 'Trombose coronariana (IAM)', hint: 'cateterismo',
      conduct: 'Causa frequente de FV/TV. Após RCE: ECG de 12 derivações imediato e ativação da hemodinâmica para cateterismo/angioplastia primária. Considerar reperfusão.' },
    { id: 'tep', letter: 'T', name: 'Tromboembolismo pulmonar', hint: 'trombólise',
      conduct: 'Suspeita: AESP, distensão de VD ao USG, fatores de risco. Considerar trombólise (ex.: alteplase 50 mg IV) e RCP prolongada (60–90 min). Considerar trombectomia/ECMO.' }
  ],

  /* ---- Circunstâncias especiais / algoritmos modificados ---- */
  special: [
    { id: 'hipercalemia', title: 'Hipercalemia', sub: 'a causa mais reversível e mais esquecida',
      body: '<p>Suspeitar em DRC, diálise, rabdomiólise, acidose, drogas (IECA, espironolactona). Tratar empiricamente se forte suspeita.</p><ol>'
        + '<li><b>Cálcio</b> — gluconato de cálcio 10% 10–30 mL IV (ou cloreto de cálcio 10% 10 mL), estabiliza a membrana. Repetir se necessário.</li>'
        + '<li><b>Bicarbonato de sódio</b> — 1 mEq/kg IV (50 mEq), sobretudo se acidose.</li>'
        + '<li><b>Insulina regular 10 U IV + glicose</b> — 25 g (50 mL de glicose a 50%). Monitorar glicemia.</li>'
        + '<li><b>Salbutamol</b> inalatório em dose alta (adjuvante).</li>'
        + '<li><b>Diálise de urgência</b> — tratamento definitivo; acionar nefrologia precocemente.</li></ol>' },
    { id: 'tep', title: 'TEP maciço', sub: 'trombólise e RCP prolongada',
      body: '<p>Considerar em AESP com VD distendido ao POCUS, TVP, pós-operatório, câncer.</p><ol>'
        + '<li><b>Trombólise</b>: alteplase 50 mg IV em bolus; pode repetir 50 mg. (Alternativa: tenecteplase por peso.)</li>'
        + '<li>Manter <b>RCP por 60–90 min</b> após o trombolítico antes de considerar término.</li>'
        + '<li>Considerar <b>trombectomia</b> (cirúrgica/cateter) ou <b>ECMO</b> se disponível.</li></ol>' },
    { id: 'last', title: 'Intoxicação por anestésico local (LAST)', sub: 'emulsão lipídica',
      body: '<p>Suspeitar após bloqueio/infiltração com bupivacaína, lidocaína etc.</p><ol>'
        + '<li><b>Emulsão lipídica 20%</b>: bolus de 1,5 mL/kg (peso magro) em 2–3 min (≈100 mL no adulto).</li>'
        + '<li><b>Infusão</b>: 0,25 mL/kg/min; aumentar para 0,5 se instável.</li>'
        + '<li>Repetir o bolus 1–2× se persistir colapso. Dose máxima ≈ 12 mL/kg.</li>'
        + '<li>Evitar altas doses de adrenalina (usar &lt; 1 mcg/kg), vasopressina, BCC e betabloqueadores.</li></ol>' },
    { id: 'gestante', title: 'Gestante', sub: 'desvio uterino e cesárea perimortem',
      body: '<ol>'
        + '<li><b>Desvio uterino manual para a esquerda</b> (deslocar o útero, aliviando a compressão da cava) — mais eficaz que inclinar a paciente.</li>'
        + '<li>Compressões com as mãos levemente mais altas no esterno.</li>'
        + '<li>Via aérea precoce (maior risco de aspiração e via aérea difícil).</li>'
        + '<li><b>Cesárea perimortem</b>: se útero ≥ altura da cicatriz umbilical (≈ 20 sem) e sem RCE em 4 min — extração fetal em até 5 min do início da parada. Melhora o desfecho materno e fetal.</li></ol>' },
    { id: 'hipotermia', title: 'Hipotermia', sub: '"não está morto até estar quente e morto"',
      body: '<ol>'
        + '<li>Medir <b>temperatura central</b>. RCP prolongada — sobrevida possível mesmo após tempos longos.</li>'
        + '<li>Se <b>T &lt; 30 °C</b>: limitar a <b>3 choques</b> e <b>suspender drogas</b> até reaquecer.</li>'
        + '<li>Se T 30–35 °C: espaçar o intervalo das drogas (dobrar).</li>'
        + '<li><b>Reaquecimento ativo</b> — ideal extracorpóreo (ECMO/CEC); alternativas: lavagens aquecidas, ar/fluidos aquecidos.</li></ol>' },
    { id: 'pneumotorax', title: 'Pneumotórax hipertensivo', sub: 'descompressão imediata',
      body: '<p>Sinais: ausência de murmúrio, hipertimpanismo, desvio de traqueia, turgência jugular, resistência à ventilação.</p><ol>'
        + '<li><b>Descompressão por agulha</b> imediata: 2º EIC na linha hemiclavicular ou 4º/5º EIC na linha axilar média.</li>'
        + '<li>Seguir com <b>drenagem torácica</b> definitiva.</li></ol>' },
    { id: 'tamponamento', title: 'Tamponamento cardíaco', sub: 'pericardiocentese',
      body: '<p>POCUS: derrame pericárdico com colapso diastólico de câmaras direitas.</p><ol>'
        + '<li><b>Pericardiocentese</b> guiada por ultrassom (acesso subxifoide).</li>'
        + '<li><b>Toracotomia de reanimação</b> se trauma penetrante torácico.</li></ol>' },
    { id: 'intox', title: 'Intoxicações (genérico)', sub: 'antídotos relevantes',
      body: '<ul>'
        + '<li><b>Opioides</b> → naloxona 0,4–2 mg IV/IM, repetir.</li>'
        + '<li><b>Tricíclicos</b> (QRS largo) → bicarbonato de sódio.</li>'
        + '<li><b>Betabloqueador / BCC</b> → cálcio, glucagon, insulina em altas doses + glicose; vasopressores.</li>'
        + '<li><b>Digoxina</b> → anticorpo antidigoxina (Fab).</li>'
        + '<li><b>Anestésico local</b> → emulsão lipídica (ver LAST).</li>'
        + '<li><b>Benzodiazepínicos</b> → flumazenil (cautela: risco de convulsão).</li>'
        + '<li><b>Monóxido de carbono</b> → O₂ 100% / câmara hiperbárica.</li>'
        + '<li><b>Cianeto</b> → hidroxocobalamina.</li></ul>' }
  ],

  /* ---- Bundle pós-parada (pós-RCE) ---- */
  bundle: [
    { id: 'ecg', title: 'ECG de 12 derivações', sub: 'ativar hemodinâmica/cateterismo se IAM' },
    { id: 'pam', title: 'Alvo de PAM ≥ 65 mmHg', sub: 'fluidos e vasopressor conforme necessário' },
    { id: 'spo2', title: 'SpO₂ 92–98% — evitar hiperóxia', sub: 'titular FiO₂' },
    { id: 'paco2', title: 'PaCO₂ 35–45 mmHg — evitar hipocapnia', sub: 'ajustar ventilação' },
    { id: 'ttm', title: 'Controle direcionado de temperatura', sub: 'TTM 32–37,5 °C; evitar febre ativamente' },
    { id: 'glic', title: 'Controle glicêmico', sub: 'evitar hipo e hiperglicemia' },
    { id: 'eeg', title: 'Vigilância de convulsão / EEG', sub: 'tratar crises; considerar monitorização' },
    { id: 'causa', title: 'Identificar e tratar a causa', sub: 'manter abordagem dos 5H e 5T' }
  ],

  /* ---- Presets de diluição para checagem de concentração ---- */
  noraPresets: [
    { label: '4 mg / 250 mL', mass: 4, vol: 250 },
    { label: '8 mg / 250 mL', mass: 8, vol: 250 },
    { label: '16 mg / 250 mL', mass: 16, vol: 250 },
    { label: '16 mg / 100 mL', mass: 16, vol: 100 }
  ],
  // Concentração plausível de noradrenalina (mcg/mL)
  noraConcRange: { min: 8, max: 160 },

  amioPresets: [
    { label: '900 mg / 500 mL', mass: 900, vol: 500 },
    { label: '450 mg / 250 mL', mass: 450, vol: 250 },
    { label: '600 mg / 500 mL', mass: 600, vol: 500 }
  ],
  // Concentração plausível de amiodarona (mg/mL)
  amioConcRange: { min: 0.9, max: 3 },

  // Intervalos padrão (segundos)
  cycleSec: 120,        // ciclo de 2 minutos
  epiIntervalSec: 240,  // adrenalina a cada 3–5 min (alvo 4 min)
  causeNudgeSec: 240    // cobrar causas reversíveis a cada 4 min sem ação
};
