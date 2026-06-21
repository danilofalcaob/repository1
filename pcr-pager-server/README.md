# pcr-pager-server — paging (Web Push) do Código Azul

Servidor mínimo que recebe inscrições (push subscriptions) dos aparelhos dos
membros e, ao receber um **Código Azul**, dispara uma **notificação push** para
todos os inscritos na mesma equipe/unidade.

> ⚠️ **Leia antes de confiar nisto como pager clínico.** Web Push entrega uma
> **notificação**. Um **alarme alto com o app fechado/bloqueado não é garantido**
> pelos navegadores — sobretudo no **iOS**, onde tocar mesmo no silencioso exige
> um **app nativo** com a permissão "critical alerts" da Apple. No **Android**,
> com o PWA instalado, a notificação costuma tocar o som do canal de
> notificação. Veja `../pcr/PAGER.md` para o caminho nativo (confiável).

## 1. Instalar e gerar chaves VAPID

```bash
cd pcr-pager-server
npm install
npm run gen-keys      # imprime Public Key e Private Key
```

## 2. Configurar e rodar

```bash
export VAPID_PUBLIC_KEY="<public key gerada>"
export VAPID_PRIVATE_KEY="<private key gerada>"
export VAPID_SUBJECT="mailto:voce@seu-dominio.com"
export PORT=8080
npm start
```

O servidor sobe em `http://localhost:8080`. Para produção, exponha por **HTTPS**
(Web Push exige origem segura no cliente) — hospede em Render, Railway, Fly.io,
um VPS com proxy TLS, etc. **CORS está liberado** para o PWA conseguir chamar.

## 3. Apontar o app para o servidor

No app de PCR (`/pcr/`), abra **📟 Pager** na tela inicial, informe a **URL do
servidor**, a **equipe/unidade** e o **nome**, e toque em **Ativar neste
aparelho** (concede permissão de notificação e se inscreve). Cada membro repete
isso no próprio aparelho, usando a **mesma equipe/unidade**.

Ao tocar **Código Azul** num aparelho, o app chama `POST /page` e o servidor
notifica todos os inscritos daquela equipe.

## Endpoints

| Método | Rota               | Descrição                                            |
|-------:|--------------------|------------------------------------------------------|
| GET    | `/health`          | status + nº de inscrições/tokens + FCM on/off        |
| GET    | `/vapidPublicKey`  | chave pública VAPID (texto)                          |
| POST   | `/subscribe`       | Web Push: `{ team, name, subscription }`             |
| POST   | `/unsubscribe`     | `{ endpoint }`                                       |
| POST   | `/registerToken`   | App nativo (FCM): `{ team, name, token, platform }`  |
| POST   | `/unregisterToken` | `{ token }`                                          |
| POST   | `/page`            | `{ team, by?, roles?, message? }` → dispara Web Push + FCM |

## FCM (app nativo — alarme crítico)

Para acionar o app nativo (`../pcr-native`) com **alarme crítico** (iOS Critical
Alerts / Android alarme), habilite o FCM definindo a conta de serviço do
Firebase:

```bash
export FIREBASE_SERVICE_ACCOUNT="$(cat caminho/para/serviceAccount.json)"
npm install            # instala firebase-admin (optionalDependency)
npm start
```

Com isso, `POST /page` envia push crítico para os tokens registrados em
`/registerToken`, além das inscrições Web Push. Se `FIREBASE_SERVICE_ACCOUNT`
não estiver definido, o servidor funciona só com Web Push (FCM desligado).

> A entrega de critical alert no iOS com o app encerrado exige a entitlement
> aprovada pela Apple e **deve ser validada em dispositivo real**.

## Limitações / produção

- Persistência em arquivo JSON (`subscriptions.json`) — para uso real, troque
  por um banco e **adicione autenticação** (qualquer um com a URL pode disparar).
- Sem rate-limit/anti-abuso. Restrinja por rede/credencial em produção.
- Privacidade: armazena nome + endpoint de push. Avalie LGPD/políticas locais.
