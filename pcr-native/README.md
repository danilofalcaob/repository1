# pcr-native — app nativo (scaffold) com pager de alarme crítico

Esqueleto de **React Native** focado no que o PWA **não** garante: tocar um
**alarme alto mesmo com o celular bloqueado / no silencioso**.

- **iOS:** Critical Alerts (APNs com `sound.critical`) — exige **entitlement
  aprovada pela Apple**.
- **Android:** canal de alta importância com som de alarme em loop +
  full-screen intent + bypass do "Não perturbe".

> ⚠️ **Isto é um scaffold NÃO COMPILADO.** Foi escrito sem toolchain nativo,
> dispositivos ou contas Apple/Google disponíveis. Use como ponto de partida:
> os módulos de lógica (`src/`) estão prontos; falta inicializar o projeto RN,
> instalar dependências e fazer o wiring nativo descrito abaixo. **Teste em
> dispositivos reais** — entrega de critical alert é sensível a configuração.

## Conteúdo deste diretório

| Arquivo | Papel |
|---|---|
| `App.tsx` | shell: tela inicial (Código Azul), navegação por abas, debrief |
| `index.js` | registra handlers de background (FCM/Notifee) + app |
| `src/notifications.ts` | alarme crítico (Notifee) + FCM (permissão, canal, display) |
| `src/pager.ts` | registra token no servidor e dispara o Código Azul |
| `src/useCode.tsx` | **motor do código**: cronômetros, log, fração de compressão, métricas, recuperação |
| `src/screens.tsx` | telas: Código, Causas (5H/5T), Especiais, Pós-RCE (+infusões), Término, Log, Equipe, Debrief |
| `src/clinicalData.ts` | conteúdo clínico (5H/5T, algoritmos, bundle, presets) — porte de `pcr/data.js` |
| `src/format.ts` | formatação de tempo + cálculo de infusões com checagem de concentração |
| `src/metronome.ts` | metrônomo 100–120/min (Vibration; TODO áudio via lib) |
| `src/teamStore.ts` | persistência da equipe (check-in + funções) |
| `app.json` / `package.json` | config e dependências de referência |

Os módulos clínicos do PWA (timer + loop do ritmo, 5H/5T, circunstâncias
especiais, pós-RCE com infusões, término e debrief com indicadores) já estão
**portados** em `src/`. Faltam apenas itens que dependem de libs nativas:
**metrônomo audível** (hoje vibração — ver TODO em `metronome.ts`), **voz
"Carregue as pás"** (adicionar `react-native-tts`) e **exportação PDF/CSV**
(ex.: `react-native-share`). A tela compartilhada do PWA não foi portada.

## Passo a passo

### 1. Criar o projeto base e trazer estes fontes

```bash
npx @react-native-community/cli init PcrNative --version 0.76.5
# copie App.tsx, index.js, app.json e a pasta src/ deste diretório para o projeto
cd PcrNative
npm install @notifee/react-native @react-native-firebase/app \
  @react-native-firebase/messaging @react-native-async-storage/async-storage
cd ios && pod install && cd ..
```

### 2. Firebase (FCM)

1. Crie um projeto no [Firebase Console](https://console.firebase.google.com).
2. **Android:** adicione o app, baixe `google-services.json` para
   `android/app/`. Aplique o plugin Google Services (o `@react-native-firebase`
   documenta as 2 linhas no Gradle).
3. **iOS:** adicione o app, baixe `GoogleService-Info.plist` para `ios/`.
   Em **APNs**, suba a *Auth Key (.p8)* no Firebase (Cloud Messaging).

### 3. Android — som de alarme, permissões e full-screen

- Coloque um arquivo de som em `android/app/src/main/res/raw/alarm.mp3`.
- Em `AndroidManifest.xml` (dentro de `<manifest>`):
  ```xml
  <uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
  <uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT"/>
  <uses-permission android:name="android.permission.VIBRATE"/>
  ```
- O canal `codigo-azul` é criado em runtime por `ensureChannel()`.

### 4. iOS — Critical Alerts

- Som: adicione `alarm.caf` ao bundle do app (Xcode → target → *Copy Bundle
  Resources*).
- **Entitlement:** `com.apple.developer.usernotifications.critical-alerts`.
  Requer **solicitação e aprovação da Apple**
  (<https://developer.apple.com/contact/request/notifications-critical-alerts-entitlement/>).
  Sem isso, o som não fura o silencioso.
- `AppDelegate`: integre o Notifee conforme a doc oficial
  (<https://notifee.app/react-native/docs/ios/critical>), e registre para
  remote messages (FCM).
- `Info.plist`: `UIBackgroundModes` → `remote-notification`.

### 5. Servidor

Use o `pcr-pager-server` (mesmo repo) com **FCM habilitado**: defina a env
`FIREBASE_SERVICE_ACCOUNT` (JSON da conta de serviço do Firebase). O endpoint
`POST /page` passa a enviar push crítico aos tokens nativos registrados em
`POST /registerToken` (este app faz isso ao "Ativar neste aparelho").

### 6. Rodar

```bash
npm run android   # ou: npm run ios   (device físico p/ testar som/alarme)
```

## Como funciona o acionamento

1. Cada membro abre **Pager**, informa **URL do servidor + equipe + nome** e
   toca **Ativar neste aparelho** → registra o token FCM no servidor.
2. Em **Equipe**, faz check-in e o líder designa as funções (um membro pode
   acumular 2). Salvo localmente (`AsyncStorage`).
3. Ao tocar **CÓDIGO AZUL**: alarme local imediato + `POST /page`, e o servidor
   dispara o alarme crítico nos demais aparelhos da equipe.

## Limitações / produção

- Critical Alerts iOS dependem de aprovação da Apple e de teste em device.
- Distribuição: App Store/Play Store **ou** MDM hospitalar (recomendado p/ uso
  institucional, evita revisão pública e facilita provisionamento).
- Adicione **autenticação** no servidor antes de uso real (hoje qualquer um com
  a URL dispara). Avalie LGPD para nomes/tokens.
- Porte o restante do conteúdo clínico do PWA (`pcr/data.js`, `pcr/app.js`)
  para ter o copiloto completo (timer, 5H/5T, pós-RCE, término, debrief).
