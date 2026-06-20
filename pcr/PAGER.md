# Acionamento da equipe (pager) — caminhos técnicos

O app de PCR aciona a equipe pelo **Código Azul**. Há dois níveis de entrega.

## A) No dispositivo (já implementado)

O Código Azul toca um **alarme de alto volume** (sirene WebAudio + vibração) e
mostra a escalação por função **no aparelho onde o app está aberto** (ex.: tablet
do carrinho, tela da sala). 100% offline, sem servidor.

## B) Web Push entre celulares (implementado, opcional, online)

Aciona uma **notificação push** nos celulares dos membros que ativaram o pager
(`📟 Pager` na tela inicial) apontando para o mesmo servidor/equipe. Requer o
`pcr-pager-server` (ver `../pcr-pager-server/README.md`).

**Limitações honestas:**
- **iOS:** Web Push exige o PWA **instalado na tela inicial** (iOS 16.4+) e
  entrega só uma **notificação**; **não há som alto garantido com o app
  fechado**, e não dá para furar o silencioso/Foco.
- **Android:** com o PWA instalado, a notificação geralmente toca o som do canal
  — mais confiável que o iOS, mas ainda sujeito ao modo do aparelho.
- Em foreground (app aberto), o alarme WebAudio toca normalmente.

Ou seja: Web Push é bom como **acionamento complementar**, não como pager
hospitalar crítico.

## C) App nativo (caminho confiável — recomendado para pager crítico)

Para um pager que **toca alto mesmo com o telefone bloqueado/no silencioso**, é
preciso um **app nativo**:

- **iOS:** **Critical Alerts** (APNs com a entitlement `com.apple.developer.usernotifications.critical-alerts`) — exige **aprovação especial da Apple** e justificativa (saúde/segurança). Toca acima do silencioso/Foco, volume próprio.
- **Android:** canal de notificação com `IMPORTANCE_HIGH` + `category = CALL`/full-screen intent + som/`AudioAttributes` de alarme; foreground service para confiabilidade.

**Arquitetura sugerida:**
1. App nativo (React Native ou Flutter) reutilizando o conteúdo clínico e o fluxo
   do PWA (a lógica já está isolada em `data.js`/`app.js`).
2. Backend com **FCM** (Android) e **APNs** (iOS) — pode evoluir do
   `pcr-pager-server` trocando Web Push por FCM/APNs.
3. **Autenticação** dos membros + grupos por unidade/plantão.
4. Registro de tokens no check-in; `/page` dispara push crítico ao grupo.

**Esforço:** projeto à parte (contas Apple/Google, provisionamento de push,
revisão da Apple para Critical Alerts, publicação nas lojas ou MDM hospitalar).
