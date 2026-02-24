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

**Stage 2 — DOM Scanning** (`scanner.ts`): Walks the entire DOM in three passes:
- **Forms:** Captures `id`, `action`, `method`, and all `<input>`/`<select>`/`<textarea>` within (including their `name`, `type`, `required`, `placeholder`, and associated `<label>` text)
- **Buttons:** Finds `<button>`, `[role="button"]`, etc. with `aria-label` or descriptive IDs. Skips buttons inside forms (those are captured with the form).
- **Annotated elements:** Finds any non-standard element (`<div>`, `<span>`, `<a>`, etc.) with a `data-tool-name` attribute — treated as click-to-execute tools.

All three passes honour `data-tool-ignore` (excluded) and `data-tool-*` declarative overrides for names, descriptions, and annotations. See [Declarative Overrides](#declarative-overrides-data-tool-attributes) below.

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
│                                                                  │
│  A. trackEvent("TOOL_ATTEMPT")     ← We log what was attempted   │
│                                                                  │
│  B. User Confirmation (NEW):                                     │
│     └─ If destructiveHint: true → requestUserInteraction()       │
│        → Native browser confirmation dialog                      │
│                                                                  │
│  C. DOM Interaction:                                             │
│     ├─ FORM:  Fill each input with args → requestSubmit()        │
│     └─ BUTTON: element.click()                                   │
│                                                                  │
│  D. trackEvent("TOOL_SUCCESS")     ← We log what worked          │
│     — or —                                                       │
│     trackEvent("TOOL_ERROR")       ← We log what broke           │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

> **Why is this valuable?** The telemetry data (`TOOL_ATTEMPT`, `TOOL_SUCCESS`, `TOOL_ERROR`) is what we sell. Customers can see which tools AI agents are calling, which sites get the most AI traffic, which tools are failing, and how long interactions take. This is the "Stripe metrics dashboard" for AI agent activity.

### Module Structure

```
packages/sdk/src/
├── types.ts        # All interfaces: ToolSchema, ToolAnnotations, ModelContextAPI, etc.
├── logger.ts       # [3rdEye] prefixed, debug-aware console logger
├── telemetry.ts    # Fire-and-forget sendBeacon tracking
├── scanner.ts      # DOM auto-scanner (forms + buttons + annotated elements)
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
| All elements have `data-tool-*` overrides | `"local"` (API skipped) | `submit_feedback` | Developer-provided |
| No API | `"local"` (fallback) | `search_form` | Rule-based |

> **Note:** If every scanned element has both `data-tool-name` and `data-tool-description`, the SDK skips the API call entirely — zero latency, zero cost.

> **Cost:** GPT-4o-mini costs ~$0.00015 per schema generation request. Results are cached in `localStorage` for 5 minutes.

> **Full API documentation:** See [`apps/api/README.md`](apps/api/README.md)

---

## Declarative Overrides (`data-tool-*` Attributes)

Developers can annotate any HTML element with `data-tool-*` attributes to override auto-generated schema values, control annotations, or register non-standard elements (like `<div>` and `<span>`) as tools.

### Supported Attributes

| Attribute | Applies To | Description |
|-----------|-----------|-------------|
| `data-tool-name` | Any element | Override the generated tool name (e.g. `"submit_feedback"`) |
| `data-tool-description` | Any element | Override the generated description |
| `data-tool-readonly` | Any element | Set `readOnlyHint: true` |
| `data-tool-destructive` | Any element | Set `destructiveHint: true` |
| `data-tool-idempotent` | Any element | Set `idempotentHint: true` |
| `data-tool-open-world` | Any element | Set `openWorldHint: true` |
| `data-tool-param` | `<input>`, `<select>`, `<textarea>` | Override the parameter description for this field |
| `data-tool-ignore` | Any element | Exclude this element from scanning entirely |

### Examples

**Override a form's tool name + annotations:**
```html
<form id="feedback-form" action="/api/feedback" method="POST"
  data-tool-name="submit_feedback"
  data-tool-description="Submit user feedback about the product"
  data-tool-open-world>
  <input name="message" data-tool-param="The feedback message content" required>
  <button type="submit">Send</button>
</form>
```

**Register a non-standard element (`<div>`) as a tool:**
```html
<div id="chat-widget"
  data-tool-name="open_support_chat"
  data-tool-description="Open the live support chat widget"
  data-tool-readonly
  onclick="openChat()">
  💬 Need help? Click here.
</div>
```

**Exclude an element from scanning:**
```html
<button id="admin-btn" data-tool-ignore>🔒 Admin Panel</button>
```

### How It Works

1. The scanner reads `data-tool-*` attributes on every element it encounters
2. Declarative values **override** auto-generated or AI-inferred values (name, description, annotations)
3. Elements with `data-tool-ignore` are skipped entirely
4. Non-standard elements (anything not `<form>`, `<button>`, `[role="button"]`) are picked up by a dedicated `scanAnnotated()` pass if they have `data-tool-name`
5. If **all** elements have both `data-tool-name` and `data-tool-description`, the API call is skipped entirely

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

To evolve 3rd Eye from a promising POC (v1.0) to a robust, production-ready SDK (v2.0), we need to address the key limitations identified in real-world testing and feedback. This includes enhancing compatibility with modern web frameworks, improving performance and scalability, adding developer-friendly customizations, bolstering security/governance, and expanding testing/integration options.

The goal for v2.0 is to make the SDK **"drop-in ready" for 80% of websites** (including SPAs and enterprise apps) while maintaining the zero-config appeal.

We'll prioritize features based on impact: Start with core scanner/registration upgrades, then performance optimizations, followed by advanced features and integrations. Estimated timeline: **1-3 months** for a small team, assuming iterative releases (e.g., v1.1 for quick wins like declarative attrs).

---

### Where We Are Now vs. Where WebMCP Expects Us

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

The developer **knows** their own website, writes schemas by hand, and the `execute` callback calls their actual API — not DOM manipulation. Zero delay, no AI involved.

**What 3rd Eye does differently:** We automate this entire process. Our SDK reverse-engineers tools from the DOM and uses DOM manipulation (filling inputs, clicking buttons) as the execute strategy instead of direct API calls. This is a clever shortcut but also a tradeoff.

| Aspect | Without 3rd Eye | With 3rd Eye |
|--------|----------------|-------------|
| **Schema authoring** | Developer writes JSON Schema by hand for each tool | Automatic — scanner + AI figures it out |
| **Execute callback** | Calls actual backend APIs directly | DOM manipulation (fill inputs, click buttons) |
| **Annotations** | Developer decides manually | Inferred from HTTP method + AI |
| **Maintenance** | Developer updates schemas when UI changes | MutationObserver handles it automatically |
| **Time to integrate** | Hours per tool | One `<script>` tag |

The "without 3rd Eye" approach is **better quality** (direct API calls > DOM manipulation) but **way more work**. Our value prop: "drop in one script tag and every form/button on your site becomes an AI tool instantly."

---

### Current Limitations (Honest Assessment)

| Limitation | Impact | v2 Fix |
|-----------|--------|--------|
| Only scans `<form>` + `<button>` — misses `<div onClick>` and custom components | Misses ~70% of modern SPA actions | Enhanced element detection + framework adapters |
| `querySelectorAll` can't see shadow roots (Web Components) | Sites using Lit/Stencil/LWC partially invisible | Shadow DOM piercing |
| AI schema gen takes ~8-9s per page load | Too slow for production | Pre-computed schemas via CLI/build plugin |
| DOM manipulation is brittle (breaks on CSRF, JS validation) | Execute fails on secured forms | Direct API execution mode |
| `popstate`/`hashchange` miss some SPA routers | React Router/Next.js transitions missed | `history.pushState` monkey-patching |
| Only handles standard `<input>` — not date pickers, rich editors | Complex UIs partially broken | Custom input handlers |
| Multi-step wizards only expose current step | Checkout flows incomplete | Flow grouping + watcher-based step detection |

---

### Prioritized v2 Roadmap

#### 1. ~~Hybrid Approach with Declarative HTML Attributes~~ ✅ SHIPPED (v1.1)

> Already implemented by @smahendra14 — see [Declarative Overrides](#declarative-overrides-data-tool-attributes) above.

Supports `data-tool-name`, `data-tool-description`, `data-tool-readonly`, `data-tool-destructive`, `data-tool-idempotent`, `data-tool-open-world`, `data-tool-param`, `data-tool-ignore`, and `scanAnnotated()` for non-standard elements.

**Remaining work:** Add `data-tool-execute="api:/api/search"` for hybrid execute mode (see item 4).

---

#### 2. Enhanced Custom Element Detection for Modern Frameworks

**Priority:** 🔴 High — v1.0 only scans standard HTML, missing ~70% of top sites.

**Tasks:**
- Extend `scanner.ts` to detect interactive elements via `[onClick]`, `[role="button"]`, `[aria-role="combobox"]`, and common patterns (e.g., `class="btn"` with JS handlers)
- Use `MutationObserver` to inspect event listeners dynamically (e.g., via `getEventListeners` in dev mode)
- Add framework-specific heuristics: For React, look for `data-reactid` or common component props; for Vue, vue-specific attrs
- Integrate optional **framework adapters** (e.g., a React HOC or Vue plugin to expose components programmatically)

**Success Criteria:** Scanner identifies 90%+ of actions on cloned real-world sites like a Next.js e-commerce demo. Unit tests for SPA edge cases.

---

#### 3. Shadow DOM Piercing and Traversal

**Priority:** 🟠 Medium-High — blocks Web Component compatibility (Salesforce, Stencil, etc.)

**Tasks:**
- In `scanner.ts` and `watcher.ts`, recursively traverse shadow roots using `element.shadowRoot` with a depth-limited walker (to avoid perf issues)
- Handle `composed: true` for events bubbling out of shadows
- Add config option `data-shadow-depth="3"` to limit recursion

**Success Criteria:** Test on a LitElement demo — detects encapsulated forms/buttons. No perf regression (scan time <500ms).

---

#### 4. Direct API Execution as Optional Execute Strategy

**Priority:** 🔴 High — fixes core brittleness of DOM manipulation.

**Rationale:** DOM manipulation is brittle (breaks on JS validation, CSRF, complex inputs). Allowing site owners to map tools to real APIs makes executes deterministic and secure, aligning closer to WebMCP's intent.

**Tasks:**
- In `registrar.ts`, add execute modes: `"dom"` (default, v1.0 style) vs. `"api"` (fetch-based)
- Allow declarative attrs like `data-tool-execute="api:/api/search?query={query}"` with placeholder interpolation
- For auto-scanned elements, infer API from form `action`/`method` if possible; fallback to DOM
- Handle auth: Pass user session headers (e.g., cookies) in API calls if permitted
- Update telemetry to log execute mode and latency

**Success Criteria:** On a test site with APIs, tools return JSON directly without DOM hacks. Error rates drop in e2e tests.

---

#### 5. Pre-Computed Schemas with Server-Side Generation

**Priority:** 🔴 High — client-side AI gen causes ~8-9s delays, unacceptable for prod.

**Tasks:**
- Move schema gen to API/build time: Add a CLI tool (e.g., `pnpm 3rdeye:generate`) that scans a site's sitemap or crawls pages, generates schemas via AI, and stores in DB/Redis
- SDK fetches pre-computed schemas via `GET /api/v1/schemas?siteId=abc&path=/products` (cached forever, invalidate on deploy)
- Integrate with build tools: Plugins for Next.js/Vite to run gen during build
- Deprecate client-side AI gen for prod; keep for dev/polyfill

**Success Criteria:** Schema load <100ms. Multi-page site schemas persist across loads. Costs stay low with caching.

---

#### 6. Governance and Security Features

**Priority:** 🟡 Medium — critical for paid enterprise users.

**Rationale:** Agents with direct access raise risks (spam, PII leaks, unauthorized actions). v2.0 needs safeguards for enterprise trust.

**Tasks:**
- In `registrar.ts`, add agent auth: Optional `data-agent-key` to validate calls against site-configured keys
- Enhance user confirmation: Customizable dialogs (e.g., via `data-confirm-msg`) and audit logs sent to telemetry
- Privacy controls: Opt-out for PII fields (e.g., skip `[type="password"]`); comply with GDPR via consent prompts
- Firewall integration: Basic WASM module in `services/firewall` to enforce rate limits/policies on execute
- Telemetry anonymization: Hash sensitive args before logging

**Success Criteria:** Pass basic security audit (e.g., no unauthorized executes). Beta users report "feels safe."

---

#### 7. Complex Inputs and Multi-Step Flows

**Priority:** 🟡 Medium — limits e-commerce/finance use cases.

**Tasks:**
- In `scanner.ts`, detect advanced inputs (e.g., `[type="date"]`, `contenteditable`) and generate richer schemas (e.g., `enum` for selects)
- For multi-step: Use watcher to re-scan on navigation; add "flow" grouping in schemas (e.g., tool chains like `step1_login → step2_pay`)
- Support file uploads/drag-drop via custom execute handlers

**Success Criteria:** Works on a 3-step form demo without manual navigation.

---

#### 8. Testing and Integration Suite

**Priority:** 🟡 Medium — needed for credibility post-core features.

**Tasks:**
- Add e2e tests with Playwright in `testing/` (simulate agents calling tools)
- Create framework integrations: Shopify app, WordPress plugin, Next.js middleware
- Build swarm-engine prototype: Python sim to "attack" sites and report AXO scores (e.g., % tools succeeding)
- Add CI/CD: Auto-test on PRs with Canary browser

**Success Criteria:** 90% coverage; beta users via integrations (e.g., 10 Shopify installs).

---

#### 9. Performance Optimizations and Monitoring

**Priority:** 🟢 Low-Medium — ensure SDK doesn't slow sites.

**Tasks:**
- Profile and optimize scan/watcher (e.g., throttle to 1s debounces)
- Add perf telemetry: Track init time, schema gen latency
- Bundle size goal: Keep <10KB gzipped

**Success Criteria:** Lighthouse score impact <5%.

---

#### 10. Documentation, Dashboard Enhancements, and Launch Prep

**Priority:** 🟢 Low — wrap-up before public beta.

**Tasks:**
- Update README/docs with v2.0 examples, migration guide
- Flesh out dashboard: Visualize telemetry (charts for tool usage, failures); add alerts
- Prep for X/Product Hunt: Demo videos, beta waitlist
- OSS parts of SDK; keep API/dashboard proprietary

**Success Criteria:** Ready for public beta; 50+ signups.

---

### Pricing Strategy (v2.0)

Usage-based pricing modeled after PostHog/Datadog — charge on **events** (tool calls/telemetry) + **gens** (schema computes):

| Tier | Price | Features | Limits | Target |
|------|-------|----------|--------|--------|
| **Free** | $0/mo | Local schemas (no AI), basic analytics (7-day retention, no exports), basic firewall (block known bots) | 10k events/mo, 500 gens/mo | Hobbyists, small sites |
| **Pro** | $49/mo + $0.0001/event over 1M | AI schemas (pre-computed), full analytics (30-day retention, dashboards), advanced firewall (custom rules, budget caps), swarm (50 sims/mo) | Unlimited gens (fair-use), 1M events included | Startups, e-commerce |
| **Enterprise** | $299+/mo (custom) | Everything + unlimited swarm, SSO, dedicated support, custom retention (90+ days), advanced integrations (Zapier alerts) | Unlimited, SLAs | Big SaaS, enterprise |

**Key decisions:**
- Free tier includes basic firewall to demo value; full custom rules in Pro
- Free analytics = aggregate only (no breakdowns) → drives upgrade to Pro
- Eat OpenAI costs on free tier (capped at 500 gens/mo) for conversion
- Swarm starts in Pro (50 sims/mo) as QA hook
- Target 20% free-to-paid conversion

---

### Data & Moat Strategy

- **Hosted DB for moat** — don't edit `main.js`, serve dynamic config via API. Static JS edits = no recurring value (devs copy once, bye). Hosted analytics/firewall/swarm = control and lock-in.
- **Dumb SDK** — the SDK should be a thin client that fetches configs from the API. OSS the SDK for virality, keep API/dashboard/swarm proprietary.
- **Data retention:** Free = 7 days, Pro = 30 days, Enterprise = 90+ days
- **Privacy:** GDPR-compliant — anonymize telemetry, get consent in TOS, hash sensitive args before logging
- **Pre-computed schemas shift load:** Build-time gen → store in DB → SDK fetches via API (fast, cached forever, invalidate on deploy)

> **Track progress in GitHub Issues/Projects.** Quick wins (items 2, 4, 5) first to enable early betas. If we hit these, v2.0 positions 3rd Eye as the go-to for agentic web.

---

## 🐝 Swarm Engine — Roadmap

The Swarm Engine is a headless testing and QA tool that simulates AI agents interacting with your website via WebMCP. It's the **consumer** side of the equation — the SDK **registers** tools, the swarm **calls** them.

> **Status:** Not yet implemented. This section outlines the planned architecture, phases, and integration strategy. Building swarms early lets us QA the SDK itself — every SDK v2 change can be validated automatically.

The swarm acts as:
1. **SDK QA tool** — validates scanner improvements, annotation accuracy, execute reliability
2. **Customer-facing product** — "Test your site's AI readiness" (AXO score)
3. **Schema pre-computation engine** — headless crawl → generate schemas → store in DB → SDK fetches (solves the 8-9s delay problem)

### Architecture

```
services/swarm/
├── crawler.ts        # Playwright-based site crawler
├── executor.ts       # Calls registered tools with synthetic args
├── scorer.ts         # Calculates AXO (Agent Experience Optimization) score
├── reporter.ts       # Generates HTML/JSON reports
├── scenarios/        # Predefined test flows (e.g., "buy_product", "create_account")
│   ├── e-commerce.ts
│   ├── auth.ts
│   └── search.ts
├── config.ts         # Target URLs, timeouts, concurrency
└── index.ts          # CLI entrypoint: `pnpm swarm:run --url https://...`
```

**Tech Stack:**
- **Playwright** — headless Chrome with WebMCP flags enabled
- **TypeScript** — same as rest of monorepo
- **Hono** (optional) — expose swarm as an API (`POST /api/v1/swarm/run`)

### Phase 1 — Crawler (Find Tools)

**Goal:** Visit a URL, wait for the SDK to register tools, and collect the tool list.

```ts
// Pseudocode
const browser = await playwright.launch({
  channel: 'chrome-canary',
  args: ['--enable-features=WebMCP']
});
const page = await browser.newPage();
await page.goto(targetUrl);
await page.waitForFunction(() => window.ThirdEye?.isInitialized());

const tools = await page.evaluate(() => ThirdEye.getSchemas());
// → [{ name: "search_marketplace", description: "...", parameters: {...}, ... }]
```

**Deliverables:**
- `crawler.ts` that visits any URL and returns `ToolSchema[]`
- Handles SPAs (navigates all hash routes)
- Reports which elements were scanned vs. missed (coverage %)
- **Bonus:** Use crawler to pre-compute schemas and store in DB (merges with roadmap item 5)

### Phase 2 — Executor (Call Tools)

**Goal:** For each discovered tool, generate synthetic arguments and call it.

```ts
// For each tool:
const args = generateSyntheticArgs(tool.parameters);
// e.g., { q: "wireless headphones", category: "electronics" }

const result = await page.evaluate(async (toolName, args) => {
  const tool = navigator.modelContext?.getRegisteredTools?.()
    ?.find(t => t.name === toolName);
  if (!tool) return { status: 'NOT_FOUND' };
  try {
    const result = await tool.execute(args);
    return { status: 'SUCCESS', result };
  } catch (err) {
    return { status: 'ERROR', error: err.message };
  }
}, tool.name, args);
```

**Synthetic Arg Generation:**
- Use tool's JSON Schema to generate valid values
- String fields → lorem ipsum, email patterns, etc.
- Number fields → random within min/max
- Enum fields → random valid option
- Optional: Use GPT to generate contextually realistic args

**Deliverables:**
- `executor.ts` that calls each tool and records `SUCCESS | ERROR | TIMEOUT | USER_DENIED`
- Handles destructive tools (auto-confirm or skip based on config)
- Captures DOM state before/after execution (did anything change?)
- Measures execution latency

### Phase 3 — Scorer (AXO Score)

**Goal:** Calculate an "Agent Experience Optimization" score for the site.

```
AXO Score = (Tools Registered × 20) + (Tools Succeeded × 40) + (Annotations Correct × 20) + (Coverage × 20)
                         max 100 points
```

| Metric | Weight | How Measured |
|--------|--------|-------------|
| **Registration Rate** | 20% | `registered / total_interactive_elements` |
| **Execution Success** | 40% | `succeeded / attempted` |
| **Annotation Accuracy** | 20% | Do destructive tools have `destructiveHint`? Do read-only tools lack it? |
| **Page Coverage** | 20% | `scanned_pages / total_pages` (for multi-page sites) |

**Example report:**

```
╔══════════════════════════════════════════════════════════╗
║  🐝 Swarm Report — NeonMart (http://localhost:8080)      ║
╠══════════════════════════════════════════════════════════╣
║  AXO Score: 82/100                                       ║
║                                                          ║
║  📊 Tools Found:         23                              ║
║  ✅ Tools Succeeded:     19 (83%)                        ║
║  ❌ Tools Failed:         3 (13%)                        ║
║  ⏭️ Tools Skipped:        1 (destructive, user-denied)   ║
║                                                          ║
║  🎯 Annotation Accuracy: 21/23 (91%)                     ║
║     ⚠️ clear_cart: missing destructiveHint               ║
║     ⚠️ export_data: missing readOnlyHint                 ║
║                                                          ║
║  📄 Pages Crawled:       6/6 (100%)                      ║
║  ⏱️ Avg Execute Time:    45ms                            ║
║  📦 SDK Init Time:       1.2s                            ║
╚══════════════════════════════════════════════════════════╝
```

### Swarm vs. SDK: Different Jobs

| | SDK | Swarm |
|--|-----|-------|
| **Role** | *Registers* tools (producer) | *Calls* tools (consumer) |
| **Runs on** | Client-side, user's browser | Server-side, headless Playwright |
| **Who uses it** | Website owners | You (QA), paid customers (AXO scores) |
| **Output** | Registered WebMCP tools | Test reports, AXO scores |
| **Why both?** | SDK makes sites agent-ready | Swarm verifies they actually work |

> **Should the swarm replace the SDK?** No. The swarm can't run in a user's browser — it's headless and server-side. The SDK must still run client-side to register tools with `navigator.modelContext`. However, the swarm can **pre-compute schemas** (crawl → generate → store in DB), which the SDK then fetches. This hybrid is the plan for roadmap items 5 and 8.

### Integration with SDK v2 Development

```
1. Make SDK change (e.g., improve scanner)
2. Build SDK:  pnpm --filter @3rdeye/sdk build
3. Run swarm:  pnpm swarm:run --url http://localhost:8080
4. Check AXO score — did it improve?
5. If yes → commit. If no → debug.
```

The swarm becomes the **acceptance test** for every SDK PR.

### Integration with Pricing

| Tier | Swarm Access |
|------|-------------|
| **Free** | 5 swarm runs/mo (manual via CLI) |
| **Pro** | 50 swarm runs/mo (API + dashboard) |
| **Enterprise** | Unlimited + CI/CD integration + scheduled runs |

### Implementation Timeline

| Phase | Effort | Depends On |
|-------|--------|-----------|
| Phase 1 (Crawler) | ~1 week | Advanced test site ✅ |
| Phase 2 (Executor) | ~2 weeks | Phase 1 |
| Phase 3 (Scorer) | ~1 week | Phase 2 |
| Dashboard integration | ~2 weeks | Phase 3 + dashboard |

> **Start with Phase 1** — even a basic crawler that reports tool counts is immediately useful for SDK QA.

---

## Test Environments

| Environment | Location | Purpose |
|-------------|----------|---------|
| **Simple Demo** | [`testing/sdk-demo/`](testing/sdk-demo/) | Basic forms + buttons for quick SDK verification |
| **Advanced Demo (NeonMart)** | [`testing/advanced-demo/`](testing/advanced-demo/) | Realistic e-commerce SPA for stress-testing all SDK features |

---

## License

See [LICENSE](./LICENSE).
