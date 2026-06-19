# Contador de Frequência Respiratória (irpm)

Aplicativo de celular para **contagem da frequência respiratória** de pacientes
durante a classificação de risco / triagem médica.

O profissional toca o botão na tela a cada incursão respiratória observada. Um
cronômetro registra o tempo decorrido e o app calcula, em tempo real, a
**Frequência Respiratória (FR)** em **incursões respiratórias por minuto (irpm)**,
proporcional a 60 segundos.

## Como o cálculo funciona

A FR é obtida pela proporção:

```
FR (irpm) = (nº de toques ÷ tempo em segundos) × 60
```

Exemplos:

| Toques | Tempo | FR estimada |
|:------:|:-----:|:-----------:|
| 5      | 10 s  | **30 irpm** |
| 4      | 12 s  | **20 irpm** |
| 9      | 30 s  | **18 irpm** |

> Recomenda-se contar por pelo menos **30 segundos** para maior precisão.

## Classificação de apoio (adulto)

| Faixa de FR    | Interpretação              | Cor      |
|----------------|----------------------------|----------|
| `< 12 irpm`    | Bradipneia                 | Vermelho |
| `12 – 20 irpm` | Eupneia (normal)           | Verde    |
| `21 – 24 irpm` | Taquipneia leve            | Âmbar    |
| `≥ 25 irpm`    | Taquipneia / alerta        | Vermelho |

> ⚠️ Ferramenta de **apoio** à classificação de risco. Não substitui o
> julgamento clínico. Valores de referência são para adultos; faixas
> pediátricas variam conforme a idade.

## Como usar

1. Toque no botão grande **a cada respiração** do paciente. O primeiro toque
   inicia o cronômetro automaticamente.
2. Acompanhe a **FR estimada** e a classificação por cor em tempo real.
3. Toque em **Finalizar** para congelar o resultado, ou **Zerar** para uma
   nova medição.

## Funcionalidades

- 📱 **PWA instalável** — funciona como app nativo (Android/iOS), adicionável à
  tela inicial.
- 🔌 **Funciona offline** — via service worker, após o primeiro carregamento.
- 📳 **Feedback tátil** (vibração) a cada toque, quando suportado.
- 🎨 **Classificação por cores** em tempo real.
- ⚡ Resposta instantânea no toque (pointer events).

## Tecnologia

App **web estático** (HTML + CSS + JavaScript puro, sem dependências nem
build). Arquivos:

- `index.html` — interface e lógica do contador
- `manifest.webmanifest` — metadados do PWA
- `sw.js` — service worker (cache offline)
- `icon.svg` — ícone do app

## Executando / Publicando

Por ser estático, basta servir os arquivos por HTTP (o service worker e o
"adicionar à tela inicial" exigem **HTTPS** ou `localhost`).

**Teste local:**

```bash
# a partir da raiz do projeto
python3 -m http.server 8080
# abra http://localhost:8080 no navegador
```

**Publicação gratuita:** GitHub Pages, Netlify, Vercel ou Cloudflare Pages —
basta apontar para a raiz do repositório.

**Instalar no celular:** abra a URL no navegador (Chrome/Safari) e escolha
*"Adicionar à tela inicial"*.
