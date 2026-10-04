# 📊 Autonomous AI Spreadsheet Studio

A single-file, browser-based spreadsheet app with an **autonomous AI agent** that can read your
data, answer questions, generate rows, add formulas, format cells, create sheets, and build
charts — powered by the **Kilo Code Gateway** (OpenAI-compatible) with an optional direct
**Google Gemini** mode.

The entire UI lives in [`index.html`](./index.html) (no build step). A small, dependency-free
Node server ([`dev-proxy.js`](./dev-proxy.js)) is included to serve the app locally **and** proxy
API calls to the Kilo Gateway (which is required because the gateway does not send CORS headers).

---

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Why a proxy is required (CORS)](#why-a-proxy-is-required-cors)
- [Kilo Code Gateway integration](#kilo-code-gateway-integration)
  - [Authentication](#authentication)
  - [List available models](#list-available-models)
  - [Send a request to a model](#send-a-request-to-a-model)
  - [Error handling](#error-handling)
- [Models & the "Free" filter](#models--the-free-filter)
- [The AI agent: supported actions](#the-ai-agent-supported-actions)
- [Real-time AI Response panel](#real-time-ai-response-panel)
- [Configuration reference](#configuration-reference)
- [Testing](#testing)
- [Project structure](#project-structure)
- [Security notes](#security-notes)
- [Troubleshooting](#troubleshooting)

---

## Features

- 🧠 **Autonomous AI agent** — natural-language prompts that can update data, add columns,
  sort, format, and create sheets.
- 🔌 **Multi-provider** — Kilo Gateway, OpenCode (coding models via Kilo), and direct Google Gemini.
- 🆓 **Free-model filter** — dropdown defaults to free models; `kilo-auto/free` is pre-selected.
- 🤖 **Real-time response panel** — live status badge, model name, latency, and raw output.
- 📈 **Charts** — interactive Chart.js visualizations with AI recommendations.
- 📥 **Import/Export** — Excel (via SheetJS) and CSV.
- 🧮 **Formulas, formatting, multi-sheet** workbook, undo/redo, live filter, voice dictation.
- 🛟 **Robust error handling** — clear, actionable messages for auth, validation, and CORS failures.

---

## Quick Start

> Requirements: **Node.js 18+** (for the proxy's built-in `fetch`/`https`) and a
> **Kilo API key** from <https://api.kilo.ai> (via your Kilo account).

```bash
cd t
npm install          # installs Playwright (only needed for tests)
npm start            # starts the dev server + CORS proxy on http://localhost:8787
```

Then:

1. Open <http://localhost:8787/>
2. Click **⚙ API Keys**, paste your **Kilo** key, and **Save Settings**.
3. The model dropdown defaults to **🆓 Free Models** with `kilo-auto/free` selected.
4. Type a prompt (or click a suggestion chip) and click **Run**.
5. Watch the **🤖 AI Response** panel: `Running…` → model reply → `Done` + latency.

Use a custom port with `PORT=3000 npm start`.

> **Opening `index.html` directly (`file://`) works for the UI**, but live API calls will fail
> with a CORS error — see below. Always use the proxy for real requests.

---

## Why a proxy is required (CORS)

The Kilo Gateway (`https://api.kilo.ai`) does **not** send an `Access-Control-Allow-Origin`
header. Browsers therefore **block** any direct `fetch()` to it from your page, failing with a
generic `TypeError: Failed to fetch`.

```
┌──────────┐   fetch() cross-origin    ┌───────────────────┐
│ Browser  │ ─────────────X──────────► │ api.kilo.ai        │   ❌ blocked by CORS
└──────────┘   (no ACAO header back)   └───────────────────┘

┌──────────┐   /api/gateway (same origin)   ┌───────────┐   server-side HTTPS   ┌──────────────┐
│ Browser  │ ─────────────────────────────► │ dev-proxy │ ───────────────────►  │ api.kilo.ai  │  ✅ works
└──────────┘ ◄───────────── response ────── └───────────┘ ◄────── response ──── └──────────────┘
```

`dev-proxy.js` solves this by:

1. **Serving the static files** from this folder.
2. **Proxying** every request to `/api/gateway/*` → `https://api.kilo.ai/api/gateway/*`
   on the server side (no CORS restriction) and relaying the response back.
3. **Injecting** `window.KILO_BASE_URL_OVERRIDE = "/api/gateway"` into `index.html` so the app
   automatically calls the same-origin proxy instead of the gateway directly.

For production, replace this dev helper with a hardened backend that keeps the API key
server-side (never ship keys to the browser).

---

## Kilo Code Gateway integration

The Kilo Gateway is **OpenAI-compatible**. The app talks to it via `KILO_BASE_URL`, which resolves
(in order) to:

1. `window.KILO_BASE_URL_OVERRIDE` (set by the dev proxy to `/api/gateway`)
2. `localStorage.kilo_base_url` (optional manual override)
3. `https://api.kilo.ai/api/gateway` (direct default)

| Purpose          | Method | Path                        | Full URL (direct)                                   |
|------------------|--------|-----------------------------|-----------------------------------------------------|
| List models      | GET    | `/models`                   | `https://api.kilo.ai/api/gateway/models`            |
| Chat completion  | POST   | `/chat/completions`         | `https://api.kilo.ai/api/gateway/chat/completions`  |

### Authentication

Requests authenticate with a **Bearer token** (your Kilo API key):

```
Authorization: Bearer <YOUR_KILO_API_KEY>
```

The key is entered via **⚙ API Keys** and stored in `localStorage` under `kilo_api_key`.
> ⚠️ `localStorage` keys are visible to any JS on the page — use the proxy/production pattern for real deployments.

### List available models

```bash
curl -s https://api.kilo.ai/api/gateway/models \
  -H "Authorization: Bearer $KILO_API_KEY"
```

Response shape (OpenAI-style):

```json
{
  "data": [
    { "id": "kilo-auto/free", "name": "Auto Free", "pricing": { "prompt": "0", "completion": "0" } },
    { "id": "google/gemini-3.8-flash", "name": "Gemini 3.8 Flash", "pricing": { "prompt": "...", "completion": "..." } }
  ]
}
```

In the app, `fetchModels()` calls this endpoint, flattens `data[].id` into the dropdown, and marks
any **zero-priced** model as free (so the Free filter works on the live catalogue). If the call
fails, it falls back to a built-in hardcoded list.

### Send a request to a model

```bash
curl -s https://api.kilo.ai/api/gateway/chat/completions \
  -H "Authorization: Bearer $KILO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "kilo-auto/free",
    "messages": [{ "role": "user", "content": "Reply with exactly: PROXY OK" }],
    "max_tokens": 20
  }'
```

Response (truncated):

```json
{
  "model": "stealth/space-bunny-alpha",
  "choices": [
    { "index": 0, "finish_reason": "stop",
      "message": { "role": "assistant", "content": "PROXY OK" } }
  ]
}
```

In the app, `runAgent()` builds the `messages` array (system + user prompt + current sheet data),
POSTs to `/chat/completions`, then passes `choices[0].message.content` to `handleAgentOutput()`.

### Error handling

The gateway returns errors in several shapes. `extractApiErrorMessage()` normalises all of them so
the **real** reason is always shown (previously only `error.message` was read):

| Response shape                                             | Example                                  |
|-----------------------------------------------------------|------------------------------------------|
| `{ "error": { "code", "message" } }`                      | invalid key, unknown model               |
| `{ "error": "Malformed JSON", "message": "..." }`         | request validation errors                |
| `{ "error": "some string" }`                              | simple string error                      |
| `{ "message": "..." }`                                    | top-level message                        |

Network/CORS failures (`TypeError: Failed to fetch`) are translated into a clear, actionable message
telling the user to route calls through a proxy.

---

## Models & the "Free" filter

The **category dropdown** next to the prompt box filters the model list:

| Category            | What it shows                                                        |
|---------------------|---------------------------------------------------------------------|
| 🆓 **Free Models**  | *(default)* only free models; pre-selects `kilo-auto/free`          |
| All Models          | the entire fetched catalogue                                        |
| Google Gemini       | Gemini / Google models                                              |
| OpenCode / Coding   | coding-oriented models (`code`, `coder`, `codex`, `kilo-auto`)      |

A model is treated as **free** when its id ends with `:free` **or** it is in the `KNOWN_FREE_MODELS`
allow-list **or** the live API reports zero prompt/completion pricing. Free options are badged with
`🆓` in the dropdown (the option's `value` stays the clean model id).

---

## The AI agent: supported actions

The agent returns either conversational text **or** structured instructions. `handleAgentOutput()`
interprets the model output and can:

- **Replace sheet data** from a ```` ```csv ```` block (or a bare comma-separated block / raw CSV).
- **Execute JSON actions** found in a ```` ```json ```` block or an `{ "actions": [...] }` payload:

| Action `type`   | Effect                                        |
|-----------------|-----------------------------------------------|
| `create_sheet`  | creates a new worksheet (applied first)       |
| `add_column`    | adds a computed/!labelled column              |
| `sort`          | sorts the table by a column                   |
| `format_cells`  | applies formatting (bold, currency, etc.)     |

Order of execution: `create_sheet` → apply CSV data → `add_column` / `sort` / `format_cells`.
If the output is plain prose, it's shown as **analysis** in the response panel.

---

## Real-time AI Response panel

Every request drives the **🤖 AI Response** panel (below the prompt box):

- **Badge**: `Idle` → `Running…` (live) → `Done` (success) / `Error`.
- **Model**: the model id used for the request.
- **Timing**: round-trip latency in milliseconds (`performance.now()`).
- **Content**: the raw model output (rendered with `textContent`, so no HTML injection).
- **Clear** button resets the panel.

> This replaced the old blocking `alert()` so output is always visible, non-blocking, and testable.

Testable helpers are exposed on `window`: `runAgent`, `showResponse`, `beginResponse`,
`clearResponsePanel`, `fetchModels`, `handleAgentOutput`, `extractApiErrorMessage`, `extractJsonBlock`.

---

## Configuration reference

| Mechanism                         | Key / name                   | Purpose                                      |
|-----------------------------------|------------------------------|----------------------------------------------|
| `localStorage`                    | `kilo_api_key`               | Kilo Gateway bearer token                    |
| `localStorage`                    | `gemini_api_key`             | Google Gemini key (direct mode)              |
| `localStorage`                    | `sheet_ai_provider`          | `kilo` \| `opencode` \| `gemini_direct`      |
| `localStorage`                    | `kilo_base_url`              | manual Kilo base-URL override                |
| `window` global                   | `KILO_BASE_URL_OVERRIDE`     | base-URL override (set by the dev proxy)     |
| Env var (proxy)                   | `PORT`                       | dev-proxy port (default `8787`)              |
| Env var (tests)                   | `KILO_API_KEY`               | enables the live test suite                  |

---

## Testing

Tests use **Playwright**. Install once with `npm install` (and `npx playwright install` for browsers).

```bash
# Offline suite (no network/key needed; live tests auto-skip)
npx playwright test tests.spec.ts

# Everything (live tests skip unless KILO_API_KEY is set)
npm test

# Live integration suite against the real gateway (PowerShell)
$env:KILO_API_KEY="<your-key>"; npx playwright test tests.live.spec.ts
# bash/zsh:
KILO_API_KEY="<your-key>" npx playwright test tests.live.spec.ts
```

- [`tests.spec.ts`](./tests.spec.ts) — offline UI + unit tests (spreadsheet ops, agent output
  parsing, error-shape extraction, response-panel rendering, mocked request pipeline).
- [`tests.live.spec.ts`](./tests.live.spec.ts) — real calls to the Kilo Gateway proving the live
  model list, a live completion, end-to-end rendering in the panel, and the CORS error path.
  **Auto-skips** when `KILO_API_KEY` is unset (keeps CI green).

---

## Project structure

```
t/
├── index.html          # the entire app (UI + logic)
├── dev-proxy.js        # dependency-free dev server + Kilo CORS proxy
├── package.json        # scripts: test / dev / start
├── tests.spec.ts       # offline Playwright tests
├── tests.live.spec.ts  # live Playwright tests (needs KILO_API_KEY)
├── user-test.md        # sample AI prompts to try
└── README.md           # this file
```

---

## Security notes

- 🔑 **Never commit API keys.** Keys live in `localStorage` for local use and in the `KILO_API_KEY`
  env var for live tests — neither is committed.
- 🌐 **Client-side keys are exposed.** Any key reachable by page JS can be read by the user/extensions.
  For production, use a backend that injects the key server-side and never returns it to the browser.
- 🧪 **The dev proxy is for development only** — it forwards whatever `Authorization` header the
  browser sends and is not hardened for public exposure.

---

## Troubleshooting

| Symptom                                             | Cause / fix                                                             |
|-----------------------------------------------------|------------------------------------------------------------------------|
| Response panel shows a **CORS/network** error       | You opened `index.html` directly. Use `npm start` and open `:8787`.     |
| `401` / "authentication token is invalid"           | Missing/incorrect/expired Kilo key. Re-enter via **⚙ API Keys**.       |
| Model dropdown shows only fallback models           | `/models` call failed (CORS/key). Fix key + use the proxy.             |
| `node: command not found` on `npm start`            | Install Node.js 18+.                                                    |
| Live tests are skipped                              | Set `KILO_API_KEY` before running them.                                 |
| Port `8787` in use                                  | Run with a different port: `PORT=3000 npm start`.                       |
