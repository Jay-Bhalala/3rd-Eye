# 🔮 3rd Eye — The Stripe for Agent Experience Optimization (AXO)

> **Automatically configure Chrome's WebMCP (`navigator.modelContext`) API for any website.**

3rd Eye provides a client-side SDK, management dashboard, and high-performance API that lets websites expose structured context to AI agents — enabling a new era of agent-native web experiences.

---

## Architecture

```
3rd-Eye/
├── apps/
│   ├── web/            # Next.js — Public landing page
│   ├── dashboard/      # Next.js — Admin panel (tools, analytics)
│   └── api/            # Hono  — Schema generation & telemetry API
├── packages/
│   ├── sdk/            # 3rdeye.js — Client-side SDK (IIFE bundle)
│   ├── db/             # Prisma schema & shared DB client
│   ├── ui/             # Shared React components (Tailwind + Shadcn)
│   └── tsconfig/       # Shared TypeScript configurations
├── testing/
│   └── sdk-demo/       # Standalone test page for the SDK
└── services/           # Future micro-services (placeholders)
    ├── swarm-engine/   # Python/Playwright — Agent simulation
    ├── firewall/       # Rust/WASM — Edge security policy engine
    └── wallet/         # Node — JIT payment issuing (Stripe/Base)
```

## Tech Stack

| Layer      | Technology                         |
| ---------- | ---------------------------------- |
| Language   | TypeScript (strict mode)           |
| Frontend   | Next.js 14+ (App Router)          |
| Backend    | Hono (Cloudflare Workers / Node)   |
| AI         | OpenAI GPT-4o-mini (schema gen)    |
| Database   | PostgreSQL via Prisma              |
| Caching    | Redis + localStorage (client)      |
| SDK Bundle | tsup (IIFE → `3rdeye.min.js`)     |
| Monorepo   | Turborepo + pnpm                   |

## Getting Started

### Prerequisites

- **Node.js** ≥ 20
- **pnpm** ≥ 9 (`corepack enable && corepack prepare pnpm@latest --activate`)
- **Chrome Canary** (for WebMCP — [download](https://www.google.com/chrome/canary/))

### Install & Run

```bash
# Install all dependencies
pnpm install

# Build everything
pnpm build

# Start all apps in dev mode
pnpm dev
```

### Dev Servers

| App       | URL                    |
| --------- | ---------------------- |
| Web       | http://localhost:3000   |
| Dashboard | http://localhost:3001   |
| API       | http://localhost:3002   |

---

## SDK — How It Works

### The Big Picture

The 3rd Eye SDK (`3rdeye.min.js`, **~12 KB / ~4 KB gzipped**) is a single script tag that a website owner drops onto their page. It automatically discovers actionable UI elements (forms, buttons), converts them into [WebMCP](https://chromestatus.com/feature/web-mcp)-compatible tool schemas with safety annotations, and registers them with Chrome's `navigator.modelContext` API — making the site instantly usable by AI agents.

```html
<!-- This is all a website owner needs to add -->
<script src="https://cdn.3rdeye.dev/3rdeye.min.js" data-site-id="site_abc123"></script>
```

### The 8-Stage Pipeline

When the script loads, it runs automatically — zero configuration beyond the `data-site-id`:

```
Stage 1         Stage 2         Stage 3           Stage 4             Stage 5
┌──────────┐   ┌──────────┐   ┌──────────────┐   ┌───────────────┐   ┌──────────────┐
│ Feature  │──▷│ Scan DOM │──▷│ Generate     │──▷│ Register with │──▷│ Provide      │
│ Detect   │   │          │   │ Schemas +    │   │ WebMCP +      │   │ Context      │
│          │   │          │   │ Annotations  │   │ Annotations   │   │              │
└──────────┘   └──────────┘   └──────────────┘   └───────────────┘   └──────────────┘
                                                                            │
Stage 6              Stage 7              Stage 8                           │
┌──────────────┐    ┌──────────────┐    ┌──────────────┐                    │
│ Live Watcher │◁───│ Un-Register  │◁───│ Execute      │◁───────────────────┘
│ (Mutation    │    │ Stale Tools  │    │ Wrapper +    │
│ Observer +   │    │              │    │ User Confirm │
│ SPA Nav)     │    │              │    │              │
└──────────────┘    └──────────────┘    └──────────────┘
```

**Stage 1 — Feature Detection:** Checks if `navigator.modelContext` exists (Chrome Canary with `chrome://flags/#web-mcp`). If it doesn't exist, the SDK logs a warning and continues — scanning and schema generation still run, but tool registration gracefully skips.

**Stage 2 — DOM Scanning** (`scanner.ts`): Walks the entire DOM looking for:
- **Forms:** Captures `id`, `action`, `method`, and all `<input>`/`<select>`/`<textarea>` within (including their `name`, `type`, `required`, `placeholder`, and associated `<label>` text)
- **Buttons:** Finds `<button>`, `[role="button"]`, etc. with `aria-label` or descriptive IDs. Skips buttons inside forms (those are captured with the form).

**Stage 3 — Schema Generation** (`schema.ts`): Converts each scanned element into a WebMCP-compatible tool definition with **W3C annotations**. Uses a two-tier strategy:
- **AI-first** (via GPT-4o-mini): Generates semantic names (`search_products`) and safety annotations (`readOnlyHint: true`)
- **Local fallback**: If the API is unreachable, generates mechanical names (`search_form`) with annotations inferred from HTTP methods

**Stage 4 — Tool Registration** (`registrar.ts`): Calls `navigator.modelContext.registerTool()` for each schema, passing W3C annotations:
- `readOnlyHint` — tool only reads data (search, browse, filter)
- `destructiveHint` — tool may delete/modify data irreversibly
- `idempotentHint` — calling multiple times has same effect
- `openWorldHint` — tool interacts with external services

**Stage 5 — Context Provisioning** (`index.ts`): Calls `navigator.modelContext.provideContext()` with page metadata (title, URL, description) so AI agents understand what page they're on.

**Stage 6 — Live Watcher** (`watcher.ts`): Starts a `MutationObserver` on `document.body` + `popstate`/`hashchange` listeners for SPA navigation. When elements are added/removed:
- Debounces mutations (300ms) to avoid hammering on rapid re-renders
- Diffs against registered tools to find what's new/removed
- Auto-registers new tools, auto-unregisters stale ones

**Stage 7 — Unregistration:** When the watcher detects removed elements, it calls `navigator.modelContext.unregisterTool()` and cleans up the internal registry. No ghost tools.

**Stage 8 — The Execute Wrapper (The Trap):** Every tool's `execute` callback is wrapped with a four-phase interceptor:

```
┌─────── Every time an AI agent calls a tool ──────────────────────┐
│                                                                   │
│  A. trackEvent("TOOL_ATTEMPT")     ← We log what was attempted  │
│                                                                   │
│  B. User Confirmation (NEW):                                      │
│     └─ If destructiveHint: true → requestUserInteraction()       │
│        → Native browser confirmation dialog                      │
│                                                                   │
│  C. DOM Interaction:                                              │
│     ├─ FORM:  Fill each input with args → requestSubmit()        │
│     └─ BUTTON: element.click()                                   │
│                                                                   │
│  D. trackEvent("TOOL_SUCCESS")     ← We log what worked         │
│     — or —                                                        │
│     trackEvent("TOOL_ERROR")       ← We log what broke          │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

> **Why is this valuable?** The telemetry data (`TOOL_ATTEMPT`, `TOOL_SUCCESS`, `TOOL_ERROR`) is what we sell. Customers can see which tools AI agents are calling, which sites get the most AI traffic, which tools are failing, and how long interactions take. This is the "Stripe metrics dashboard" for AI agent activity.

### Module Structure

```
packages/sdk/src/
├── types.ts        # All interfaces: ToolSchema, ToolAnnotations, ModelContextAPI, etc.
├── logger.ts       # [3rdEye] prefixed, debug-aware console logger
├── telemetry.ts    # Fire-and-forget sendBeacon tracking
├── scanner.ts      # DOM auto-scanner (forms + buttons)
├── schema.ts       # ScannedElement[] → ToolSchema[] (API-first, local fallback, annotations)
├── registrar.ts    # WebMCP registration + execute wrapper + unregister + user confirmation
├── watcher.ts      # MutationObserver + SPA navigation + debounced re-scan
└── index.ts        # 8-stage orchestrator — auto-inits from <script> data attributes
```

> **Full SDK documentation:** See [`packages/sdk/README.md`](packages/sdk/README.md)

---

## AI Schema Setup (Optional)

By default, the SDK generates tool schemas locally from DOM metadata (mechanical names like `search_form`). To enable **AI-enhanced schemas** with GPT-4o-mini (semantic names like `search_products`, smarter annotations):

### 1. Get an OpenAI API Key

Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys) and create a key.

### 2. Configure the API server

```bash
cd apps/api
cp .env.example .env
# Edit .env and paste your key:
# OPENAI_API_KEY=sk-your-key-here
```

### 3. Start the API server

```bash
cd apps/api && pnpm dev
# → 🔮 3rd Eye API running on http://localhost:3002
```

### 4. Point the SDK at the API

Add `data-endpoint` to your script tag:

```html
<script
  src="3rdeye.min.js"
  data-site-id="site_abc123"
  data-endpoint="http://localhost:3002"
></script>
```

The SDK will call `POST /api/v1/generate-schema` on load. If the API is unreachable or the key isn't set, it falls back to local generation seamlessly.

| Scenario | Schema Source | Tool Name Example | Annotations |
|----------|---------------|-------------------|-------------|
| API + OpenAI key | `"ai"` | `search_products` | AI-inferred |
| API, no key | `"local"` | `search_form` | Rule-based |
| No API | `"local"` (fallback) | `search_form` | Rule-based |

> **Cost:** GPT-4o-mini costs ~$0.00015 per schema generation request. Results are cached in `localStorage` for 5 minutes.

> **Full API documentation:** See [`apps/api/README.md`](apps/api/README.md)

---

## Testing the SDK

### Quick Test (Any Browser)

Tests scanning, schema generation, annotations, and telemetry. Tool registration will gracefully skip since WebMCP isn't available in standard browsers.

```bash
# 1. Build the SDK
pnpm --filter @3rdeye/sdk build

# 2. Copy to test page
cp packages/sdk/dist/3rdeye.min.js testing/sdk-demo/

# 3. (Optional) Start the API for AI schemas
cd apps/api && pnpm dev

# 4. Serve the test page (separate terminal)
cd testing/sdk-demo && python3 -m http.server 8080

# 5. Open http://localhost:8080 → DevTools → Console
```

Expected output:
```
[3rdEye] Initializing with config: {siteId: "test_site_001", debug: true, …}
[3rdEye] WebMCP not supported in this browser. Polyfill active.
[3rdEye] 🔍 Scanner found 2 form(s) and 3 button(s)
[3rdEye] 🧠 Received 5 schema(s) from API (source: ai)     ← if API is running
[3rdEye] 🧠 Generated 5 schema(s) locally (fallback)        ← if API is not running
```

### Full End-to-End Test (Chrome Canary + WebMCP)

Tests **all 8 stages**, including tool registration, live watcher, annotations, user confirmation, and context provisioning.

**Prerequisites:**
1. Download [Chrome Canary](https://www.google.com/chrome/canary/)
2. Navigate to `chrome://flags/#web-mcp` → set to **Enabled** → restart

**Steps:**
```bash
# Same setup as above, but open in Chrome Canary
# Expected additional output:
```
```
[3rdEye] 🚀 Registered 5/5 tool(s) with WebMCP
[3rdEye] 📄 Provided page context to AI agent
[3rdEye] 👁️ Live watcher started (MutationObserver + SPA navigation)
```

### Test the Live Watcher

Paste in DevTools Console:
```js
// Add a new button → watcher should detect and register it
document.body.appendChild(Object.assign(document.createElement('button'), {
  id: 'test-live', textContent: 'Live Button', ariaLabel: 'Live Button'
}))

// Expected: 🔄 DOM mutation: +1 new, -0 removed
// Expected: 🚀 Registered 1/1 tool(s) with WebMCP

// Remove it after 5s → watcher should unregister
setTimeout(() => document.getElementById('test-live').remove(), 5000)

// Expected: 🔄 DOM mutation: +0 new, -1 removed
// Expected: 🗑️ Unregistered stale tool "live_button" (element removed)
```

### Verify SDK State Programmatically

```js
ThirdEye.getScannedElements()   // Array of scanned DOM elements
ThirdEye.getSchemas()           // Array of tool schemas with annotations
ThirdEye.isWatcherActive()      // true (watcher is running)
ThirdEye.isInitialized()        // true (SDK initialized)
```

### What Each Stage Tests

| Stage | What It Tests | Any Browser | Chrome Canary + WebMCP |
|-------|--------------|-------------|----------------------|
| **1. Feature Detection** | Detects `navigator.modelContext` | ⚠️ Warns "Polyfill active" | ✅ Detected |
| **2. DOM Scanning** | Finds all forms + buttons | ✅ 2 forms, 3 buttons | ✅ Same |
| **3. Schema + Annotations** | Generates schemas with `readOnlyHint` etc. | ✅ Schemas generated | ✅ Same |
| **4. Tool Registration** | Registers with `navigator.modelContext` | ❌ Gracefully skipped | ✅ Tools visible to AI |
| **5. Context Provisioning** | Sends page metadata via `provideContext` | ❌ Skipped | ✅ Context provided |
| **6. Live Watcher** | MutationObserver + SPA navigation | ✅ Watcher starts | ✅ + tools auto-register |
| **7. Unregistration** | Removes stale tools | ❌ No tools to remove | ✅ Tools cleaned up |
| **8. User Confirmation** | `requestUserInteraction` for destructive tools | ❌ Skipped | ✅ Browser dialog |

> **Full test page documentation:** See [`testing/sdk-demo/README.md`](testing/sdk-demo/README.md)

---

## Build

```bash
pnpm install          # Install all dependencies
pnpm build            # Build everything (SDK, apps, packages)
pnpm dev              # Start all dev servers (landing page, dashboard, API)
pnpm --filter @3rdeye/sdk build   # Build just the SDK
```

### SDK Build Output

| Format | File | Size | Use Case |
|--------|------|------|----------|
| IIFE | `dist/3rdeye.min.js` | ~12 KB (4 KB gzip) | `<script>` tag — exposes `ThirdEye` global |
| ESM | `dist/index.mjs` | ~23 KB | Bundler imports (`import ThirdEye from "@3rdeye/sdk"`) |
| DTS | `dist/index.d.mts` | ~8 KB | TypeScript type definitions |

---

## Next Steps to Get to SDK v2.0

### 1. Is this how WebMCP is *meant* to be used?

**Partly yes, partly no.** The W3C spec envisions two primary ways to register tools:

**The "normal" way (without 3rd Eye):**
```js
// Website developer writes this manually
navigator.modelContext.registerTool({
  name: "search_products",
  description: "Search our product catalog",
  inputSchema: { /* hand-written JSON Schema */ },
  annotations: { readOnlyHint: true },
  execute: async (args) => {
    const results = await fetch(`/api/search?q=${args.query}`);
    return results.json();
  }
});
```

This is what Chrome expects. The developer **knows** their own website, writes the schema by hand, and the `execute` callback calls their actual API — not DOM manipulation. There's zero delay because there's no AI involved.

**What 3rd Eye does differently:** We *automate* this entire process for sites that don't want to write it themselves. Our SDK reverse-engineers the tools from the DOM and uses DOM manipulation (filling inputs, clicking buttons) as the execute strategy instead of direct API calls. This is a clever shortcut but it's also a tradeoff.

**The delay concern is real.** The ~8-9 second AI schema generation is only acceptable because:
- It happens once per page load (then cached for 5 min)
- The local fallback is instant (tools register in <100ms)
- Registration happens in the background — the page isn't blocked

For production, you'd want **pre-computed schemas** stored server-side (generate once, serve forever), not generating on every page load. The current flow is fine for demos but wouldn't scale.

### 2. Without 3rd Eye, would setup be much different?

**Yes, significantly.** Here's the gap 3rd Eye fills:

| Aspect | Without 3rd Eye | With 3rd Eye |
|--------|----------------|-------------|
| **Schema authoring** | Developer writes JSON Schema by hand for each tool | Automatic — scanner + AI figures it out |
| **Execute callback** | Calls actual backend APIs directly | DOM manipulation (fill inputs, click buttons) |
| **Annotations** | Developer decides manually | Inferred from HTTP method + AI |
| **Maintenance** | Developer updates schemas when UI changes | MutationObserver handles it automatically |
| **Time to integrate** | Hours per tool | One `<script>` tag |

The "without 3rd Eye" approach is **better quality** (direct API calls > DOM manipulation) but **way more work**. 3rd Eye's value prop is: "drop in one script tag and every form/button on your site becomes an AI tool instantly."

### 3. Would this work on real, complex websites?

**Honestly? It would work partially, but there are real limitations.** Here's where it would struggle:

#### ❌ Things that would break or be incomplete:

- **React/Vue/Angular SPAs**: Our scanner finds `<form>` and `<button>` elements, but many modern SPAs use `<div onClick={...}>` or custom components that don't use standard HTML form elements. The scanner would miss these entirely.

- **Shadow DOM** (Web Components): Our `document.querySelectorAll` can't see into shadow roots. Sites using Lit, Stencil, or Salesforce Lightning would be partially invisible.

- **Client-side routing with virtual DOM**: React Router, Next.js App Router etc. — the `popstate`/`hashchange` listeners work for basic SPAs, but frameworks that use `history.pushState` without firing `popstate` would be missed.

- **Multi-step forms / wizards**: Our scanner sees the current state of the DOM. A 3-step checkout wizard would only expose Step 1's fields unless the user navigates through it.

- **Auth-protected actions**: The `requestSubmit()` approach fills visible inputs, but if a form requires a CSRF token or session cookie in a hidden field, it might work... or it might get rejected by the server.

- **Complex inputs**: Date pickers, rich text editors (Quill, TipTap), file upload dialogs, drag-and-drop interfaces — our `nativeInputValueSetter` trick only works on standard `<input>` elements.

#### ✅ Where it would work well:

- Simple marketing sites, landing pages, blogs with search/contact forms
- Documentation sites with search bars
- Basic e-commerce product pages with "Add to Cart" buttons
- Any page that uses standard HTML `<form>` elements

#### The honest summary:

3rd Eye is a **great proof of concept** and a smart product idea. The architecture is solid for what it does. But to be truly "enterprise-grade" on complex real-world sites, you'd need:

1. **Custom element detection** — not just `<form>`/`<button>` but also `[onClick]`, `[role="button"]`, custom component registries
2. **Shadow DOM piercing** — traverse into shadow roots
3. **Pre-computed schemas** — generate once at build time, not on every page load
4. **Direct API execution** — instead of DOM manipulation, let site owners provide their actual API endpoints as the execute strategy
5. **A hybrid approach** — auto-detect what you can, let developers override/augment with declarative attributes like `<form toolname="search_products" tooldescription="...">`

That last point (declarative HTML attributes) was actually in our original gap list but we haven't implemented it yet. That's probably the most impactful next step for real-world adoption.

---

## License

See [LICENSE](./LICENSE).