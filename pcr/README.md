# Manejo de PCR — Copiloto Clínico (adulto)

Aplicativo móvel (PWA) para **manejo de parada cardiorrespiratória (PCR) em
adultos**, usado por um líder de código (médico ou enfermeiro) à beira-leito,
em tempo real, durante a ressuscitação.

> A filosofia central: **não é um cronômetro com log — é um copiloto clínico.**
> Cobre os quatro pontos que determinam o desfecho e que os concorrentes
> ignoram: **o porquê da parada** (causas reversíveis), **o depois** (pós-RCE),
> **a decisão de parar** e **o time** (tela compartilhada).

⚠️ **Ferramenta de apoio à decisão. Não substitui o julgamento clínico.
Uso exclusivamente adulto.** Conteúdo alinhado às diretrizes AHA ACLS / ERC e
às diretrizes brasileiras de RCP.

## Funcionalidades (MVP)

- **Equipe do plantão (check-in + designação de funções)**
  - Cada membro faz **check-in** no dispositivo no dia do plantão (lista da
    equipe presente).
  - O **líder designa** quem fica em cada função: **Líder, Via Aérea,
    Compressão - 1º, Compressão - 2º, Monitorização/Desfibrilação,
    Medicamentos**. Um mesmo membro pode acumular **até 2 funções** (times
    incompletos). Designações feitas na troca de turno, salvas no dispositivo.
  - **Código Azul** — ao identificar a parada, o botão dispara um **alarme
    sonoro de alto volume** (e vibração) e mostra a escalação da equipe por
    função, acionando o time. *(Ver nota sobre paging multi-dispositivo abaixo.)*

- **Núcleo — timer, loop do ritmo e log**
  - Cronômetro do evento + ciclo de 2 min + intervalo de adrenalina, simultâneos,
    com alertas visuais (alto contraste) e sonoros ao exceder limites.
  - Registro com **um toque**: ritmo (FV/TV, AESP, assistolia), choque,
    adrenalina, antiarrítmico, checagem de pulso, via aérea, acesso e comentário.
  - **Fração de compressão** calculada automaticamente (toggle de pausa das
    compressões para minimizar tempo "hands-off").
  - **Metrônomo de compressões** que **liga automaticamente ao iniciar o
    código**, com frequência ajustável (padrão **110/min**, faixa **100–120**;
    passo de 5), mantendo o ritmo recomendado de 100–120/min.
  - **Aviso de voz firme** ("Carregue as pás") **15 s antes** do fim de cada
    ciclo, antecipando a checagem do ritmo (Web Speech, pt-BR; respeita o mudo).
  - **Empurra a próxima ação** (push) ao usuário em vez de exigir navegação.
  - **Linha do tempo** completa do código, com desfazer do último evento.
- **Cobrança ativa de causas reversíveis (5H e 5T)** — *nudge* temporizado se
  nenhuma causa foi trabalhada; checklist marcável como
  *considerada / descartada / em tratamento*, com a conduta em um toque.
- **Circunstâncias especiais** — sub-algoritmos para hipercalemia, TEP maciço,
  intoxicação por anestésico local (LAST), gestante, hipotermia, pneumotórax
  hipertensivo, tamponamento e intoxicações.
- **Pós-RCE** — bundle pós-parada (ECG/cateterismo, PAM, oxigenação, PaCO₂, TTM,
  glicemia, convulsão) + **cálculo de infusão de noradrenalina e amiodarona com
  checagem de concentração** (sinaliza diluições implausíveis).
- **Apoio à decisão de término** — painel que consolida âncoras objetivas
  (duração, ritmo chocável, POCUS, EtCO₂ por entrada manual). O app **não decide
  pelo profissional**.
- **Tela compartilhada** — exibição grande do ciclo e da próxima ação, legível à
  distância (TV/tablet/monitor da sala), com modo tela cheia.
- **Debrief estruturado + indicadores de qualidade** — hot debrief automático ao
  encerrar; métricas (fração de compressão, tempo até 1º choque / 1ª adrenalina,
  pausa peri-choque, nº de doses, duração); **banco de indicadores** agregado;
  **exportação em PDF e CSV**.

### Fora de escopo (por especificação)

- Sem dosagem pediátrica / cálculo por peso pediátrico / Broselow / joules/kg.
- Sem integração de hardware de capnografia — EtCO₂ entra apenas como valor
  digitado manualmente.
- Sem customização livre de medicação.

### Fase 2 (não incluído neste MVP)

Entrada por voz / hands-free, carregamento de contexto pré-parada (TRR) e
sincronização em nuvem opcional.

#### Nota — paging multi-dispositivo (acionamento entre celulares)

O alarme do **Código Azul** soa **no dispositivo em que o app está aberto**
(estação/tablet do carrinho ou tela da sala). Fazer o alarme tocar **nos
celulares dos demais membros** exige infraestrutura que rompe o modelo
offline-first:

- **Backend/servidor** sempre ativo (não cabe em GitHub Pages, que é estático)
  para receber o gatilho e retransmitir à equipe;
- **Contas/login real** dos membros e agrupamento por unidade/plantão;
- **Web Push** (VAPID + service worker) para entregar a notificação com o app
  fechado.

Limitação importante de PWA: navegadores **não garantem um alarme alto com o
app fechado/bloqueado** — especialmente no **iOS**, onde "critical alerts"
(tocar mesmo no silencioso) exigem um **app nativo** com permissão especial da
Apple. Para um pager clínico confiável entre celulares, o caminho é um **app
nativo + backend com push**. O módulo de equipe e o gatilho do Código Azul aqui
implementados são a base reutilizável para essa evolução.

## Princípios de design

- **Offline-first / local-first** — funciona 100% sem internet; dados ficam no
  dispositivo (`localStorage`), nada é enviado para a nuvem.
- **Sem fricção** — um toque na tela inicial já inicia o código (sem login).
- **À prova de erro sob estresse** — botões grandes, alto contraste, confirmação
  apenas em ações destrutivas, proteção contra fechamento acidental.
- **Resiliência** — persistência do estado a cada evento e **recuperação
  automática** do código após crash/fechamento; *wake lock* para manter a tela
  ligada.

## Tecnologia

App **web estático** (HTML + CSS + JavaScript puro, sem dependências nem build),
empacotado como **PWA instalável** com service worker para uso offline.

- `index.html` — interface e telas
- `app.js` — lógica (timers, log, métricas, persistência, exportação)
- `data.js` — **conteúdo clínico versionável** (5H/5T, algoritmos, bundle,
  presets de diluição) para facilitar atualização quando as diretrizes mudarem
- `manifest.webmanifest` · `sw.js` · `icon.svg`

## Executando localmente

```bash
# a partir da raiz do repositório
python3 -m http.server 8080
# abra http://localhost:8080/pcr/ no navegador
```

> O service worker e o "adicionar à tela inicial" exigem **HTTPS** ou
> `localhost`. Publicado via GitHub Pages, fica disponível em
> `https://<usuario>.github.io/<repositorio>/pcr/`.

**Instalar no celular:** abra a URL no navegador (Chrome/Safari) e escolha
*"Adicionar à tela inicial"*.
