<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:000000,50:1a1a1a,100:2563EB&height=180&section=header&text=The%20Warden's%20Labyrinth&fontSize=34&fontColor=FFFFFF&animation=fadeIn&fontAlignY=40&desc=AI%20Adaptive%20Cyberpunk%20Game%20%E2%80%94%20Google%20AISeekho%202026&descAlignY=62&descSize=14&descColor=2563EB" width="100%"/>

[![Google Antigravity](https://img.shields.io/badge/Google_Antigravity-000000?style=for-the-badge&logo=google&logoColor=white)](#)
[![Multi-Agent AI](https://img.shields.io/badge/Multi--Agent_AI-000000?style=for-the-badge&logo=target&logoColor=white)](#)
[![React](https://img.shields.io/badge/React_19-000000?style=for-the-badge&logo=react&logoColor=white)](https://react.dev)
[![Cloudflare](https://img.shields.io/badge/Cloudflare_Workers-000000?style=for-the-badge&logo=cloudflare&logoColor=white)](https://workers.cloudflare.com)

</div>

<br/>

### `H A C K A T H O N   S U B M I S S I O N`

| | |
|---|---|
| **Event** | Google AISeekho 2026 Hackathon |
| **Team** | 3-person team |
| **Timeline** | Built from scratch in **5 days** |
| **Deployment** | Google Antigravity · Cloudflare Workers |

<br/>

### `W H A T   I S   T H I S`

| |
|:---|
| **The Warden's Labyrinth** is a cyberpunk adaptive game built around **three simultaneous AI agents** working together in real time — not scripted enemy AI, but a coordinated multi-agent system that adapts dynamically to player behavior. |

<br/>

### `A G E N T S`

<div align="center">

| Agent | Role |
|:---|:---|
| 🎯 **Strategy Agent** | Adjusts difficulty dynamically based on player performance |
| 🗣️ **Narrative Agent** | Generates dynamic, context-aware taunts and story beats |
| ⚖️ **Referee Agent** | Enforces fair play and game rule integrity in real time |

</div>

All three agents run **simultaneously**, orchestrated through a real-time multi-agent backend — coordinating difficulty, narrative tone, and fairness on every player action.

<br/>

### `T E C H   S T A C K`

<div align="center">

| Layer | Technology |
|:---|:---|
| Frontend Framework | React 19 + TanStack Start |
| Build Tool | Vite 7 |
| Styling | TailwindCSS 4 |
| UI Components | Radix UI primitives + shadcn-style components |
| AI SDK | `ai` SDK with OpenAI-compatible endpoint |
| Routing | TanStack Router |
| Data Fetching | TanStack Query |
| Forms & Validation | React Hook Form + Zod |
| Deployment | Cloudflare Workers (via Wrangler) |
| Mobile Packaging | Capacitor → Android APK |
| Linting/Formatting | ESLint + Prettier (strict TypeScript) |

</div>

<br/>

### `A R C H I T E C T U R E`

```
┌──────────────────────────────────────────┐
│         Player (Mobile / Browser)        │
│      React 19 + TanStack Start UI        │
└────────────────────┬─────────────────────┘
                      │
┌────────────────────▼─────────────────────┐
│         Cloudflare Workers (Edge)         │
│         Real-time API + AI routing        │
└──┬─────────────┬─────────────┬───────────┘
   │              │              │
┌──▼───┐     ┌───▼────┐    ┌───▼─────┐
│Strategy│   │Narrative│    │ Referee │
│ Agent  │   │  Agent  │    │  Agent  │
└────────┘   └─────────┘    └─────────┘
   Difficulty   Taunts &      Fair-play
   tuning       story beats   enforcement
```

<br/>

### `F E A T U R E S`

- **Dynamic difficulty** — Strategy Agent reads player performance and adjusts in real time
- **Adaptive narrative** — Narrative Agent generates context-aware taunts per session
- **Fair-play enforcement** — Referee Agent monitors rule integrity continuously
- **Edge-deployed backend** — low-latency response via Cloudflare Workers
- **Cross-platform** — packaged as an Android APK via Capacitor alongside the web build
- **Type-safe codebase** — strict TypeScript with ESLint + Prettier enforcement

<br/>

### `S E T U P   &   R U N`

#### Prerequisites
- [Bun](https://bun.sh) (package manager used in this project)
- Node.js 18+

#### Installation

```bash
git clone https://github.com/SyedWaqarAliZaidi/AI-Warden-Run-Google-AI-Hackathon.git
cd AI-Warden-Run-Google-AI-Hackathon

bun install
```

#### Development

```bash
bun run dev
```

#### Build

```bash
bun run build
```

#### Lint & Format

```bash
bun run lint
bun run format
```

#### Deploy (Cloudflare Workers)

```bash
wrangler deploy
```

<br/>

### `S E C U R I T Y   N O T E S`

- No real PII or production credentials committed — see `.gitignore` / `.cyber_archive`
- Strict TypeScript + ESLint enforcement to catch type and logic errors early
- All game content and agent behavior built for the hackathon submission, fully original

<br/>

<div align="center">

*Built for the Google AISeekho 2026 Hackathon in 5 days by a 3-person team*

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:2563EB,50:1a1a1a,100:000000&height=100&section=footer" width="100%"/>

</div>
