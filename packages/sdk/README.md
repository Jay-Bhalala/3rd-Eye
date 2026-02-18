# 📦 @3rdeye/sdk — Client-Side SDK

The browser SDK that automatically scans web pages, generates AI-enhanced tool schemas, and registers them with Chrome's WebMCP API (`navigator.modelContext`).

## Installation

### Script Tag (Recommended)

```html
<script
  src="https://cdn.3rdeye.dev/3rdeye.min.js"
  data-site-id="site_abc123"
  data-endpoint="http://localhost:3002"
  data-debug="true"
></script>
```

The SDK auto-initializes on DOM ready — no additional JavaScript required.

### Script Tag Attributes

| Attribute | Required | Description |
|-----------|----------|-------------|
| `data-site-id` | ✅ | Unique site identifier from the 3rd Eye dashboard |
| `data-endpoint` | ❌ | API server URL for AI schema generation |
| `data-ingest-url` | ❌ | Custom telemetry endpoint URL |
| `data-debug` | ❌ | Set to `"true"` for verbose console logging |

### ESM Import

```ts
import ThirdEye from "@3rdeye/sdk";

await ThirdEye.init({
  siteId: "site_abc123",
  endpoint: "http://localhost:3002",
  debug: true,
});
```

---

## How It Works

### 8-Stage Pipeline

```
1. Feature Detect      → Check navigator.modelContext
2. DOM Scan            → Find <form> and <button> elements
3. Schema Generation   → AI-first (GPT-4o-mini), local fallback
4. Annotation Inference→ readOnlyHint, destructiveHint, etc.
5. Tool Registration   → registerTool() with annotations
6. Context Provisioning→ provideContext() with page metadata
7. Live Watcher        → MutationObserver + SPA navigation
8. Execute Wrapper     → Telemetry + user confirmation
```

### Schema Generation Strategy

The SDK uses a two-tier schema generation approach:

1. **AI-Enhanced** (requires API server + OpenAI key):
   - Sends scanned element metadata to `POST /api/v1/generate-schema`
   - GPT-4o-mini generates semantic tool names and descriptions
   - Also infers safety annotations (`readOnlyHint`, `destructiveHint`, etc.)
   - Results cached in `localStorage` for 5 minutes

2. **Local Fallback** (always available):
   - Generates mechanical tool names from element IDs
   - Infers annotations from HTTP methods and button text:
     - `GET` forms → `readOnlyHint: true`
     - `POST`/`PUT` forms → `openWorldHint: true`
     - `DELETE` forms → `destructiveHint: true`
     - Buttons with "delete"/"remove" text → `destructiveHint: true`
     - Buttons with "search"/"view" text → `readOnlyHint: true`

### W3C WebMCP Annotations

Every generated tool includes safety annotations per the W3C spec:

| Annotation | Meaning | Example Elements |
|-----------|---------|-----------------|
| `readOnlyHint: true` | Tool only reads data | Search forms, filter buttons |
| `destructiveHint: true` | Tool may delete/modify data irreversibly | Delete buttons, cancel forms |
| `idempotentHint: true` | Calling multiple times = same effect | Toggle buttons, refresh |
| `openWorldHint: true` | Tool interacts with external services | Login forms, payment |

### Live Watcher (MutationObserver + SPA)

After initial registration, the SDK watches for DOM changes:

- **`MutationObserver`** on `document.body` (`childList` + `subtree`)
- **`popstate`** and **`hashchange`** listeners for SPA navigation
- All mutations **debounced at 300ms** to avoid excessive re-scans
- On change: re-scans DOM → diffs against registered tools → registers new / unregisters removed

### User Confirmation for Destructive Tools

When an AI agent calls a tool marked as `destructiveHint: true`:
1. The SDK calls `client.requestUserInteraction()`
2. Chrome shows a native confirmation dialog
3. If the user denies, the tool returns `{ success: false, reason: "User denied" }`
4. If confirmed, the tool executes normally

---

## Public API

```ts
import ThirdEye from "@3rdeye/sdk";

// Initialize the SDK
await ThirdEye.init(config: ThirdEyeConfig): Promise<void>

// Re-scan DOM and register new tools
await ThirdEye.scan(): Promise<ScannedElement[]>

// Destroy SDK: unregister all tools, stop watcher, clear context
ThirdEye.destroy(): void

// State accessors
ThirdEye.isInitialized(): boolean
ThirdEye.isWatcherActive(): boolean
ThirdEye.getConfig(): ThirdEyeConfig | null
ThirdEye.getScannedElements(): ScannedElement[]
ThirdEye.getSchemas(): ToolSchema[]
```

### ThirdEyeConfig

```ts
interface ThirdEyeConfig {
  siteId: string;        // Required — unique site identifier
  endpoint?: string;     // API server URL (enables AI schemas)
  ingestUrl?: string;    // Custom telemetry endpoint
  debug?: boolean;       // Enable verbose logging (default: false)
}
```

---

## Module Reference

| File | Purpose |
|------|---------|
| `types.ts` | All TypeScript interfaces: `ToolSchema`, `ToolAnnotations`, `ModelContextAPI`, `WebMCPToolDefinition`, `ModelContextClient`, telemetry events |
| `scanner.ts` | DOM auto-scanner — finds `<form>` and `<button>` elements, extracts metadata (inputs, labels, aria-labels) |
| `schema.ts` | Schema generator — AI-first with local fallback, annotation inference, `localStorage` caching (5min TTL) |
| `registrar.ts` | Tool registration — `registerTool()` with annotations, `unregisterTool()` for stale tools, `requestUserInteraction()` for destructive tools, telemetry wrapping |
| `watcher.ts` | Live DOM watcher — `MutationObserver`, `popstate`/`hashchange`, 300ms debounce, intelligent diffing |
| `telemetry.ts` | Fire-and-forget `sendBeacon` tracking — events: `SDK_INIT`, `SCAN_COMPLETE`, `TOOL_REGISTERED`, `TOOL_UNREGISTERED`, `TOOL_ATTEMPT`, `TOOL_SUCCESS`, `TOOL_ERROR`, `DOM_MUTATION`, `SPA_NAVIGATE`, `USER_CONFIRMATION` |
| `logger.ts` | `[3rdEye]` prefixed, debug-aware console logger |
| `index.ts` | 8-stage orchestrator — config resolution, auto-init from `<script>` attributes |

---

## Build

```bash
# From monorepo root
pnpm --filter @3rdeye/sdk build
```

### Output

| Format | File | Size |
|--------|------|------|
| IIFE | `dist/3rdeye.min.js` | ~12 KB |
| ESM | `dist/index.mjs` | ~23 KB |
| DTS | `dist/index.d.mts` | ~8 KB |

The IIFE bundle is what you distribute as a `<script>` tag. It exposes the `ThirdEye` global on `window`.

---

## Telemetry Events

| Event | When Fired | Data |
|-------|-----------|------|
| `SDK_INIT` | SDK initialized | `{ endpoint }` |
| `SCAN_COMPLETE` | DOM scan finished | `{ elementCount }` |
| `TOOL_REGISTERED` | Tool registered with WebMCP | `{ toolName }` |
| `TOOL_UNREGISTERED` | Stale tool removed | `{ toolName, selector }` |
| `TOOL_ATTEMPT` | AI agent calls a tool | `{ toolName, args }` |
| `TOOL_SUCCESS` | Tool executed successfully | `{ toolName, duration }` |
| `TOOL_ERROR` | Tool execution failed | `{ toolName, error }` |
| `DOM_MUTATION` | Watcher detected DOM changes | `{ reason, added, removed }` |
| `SPA_NAVIGATE` | SPA route change detected | `{ from, to }` |
| `USER_CONFIRMATION` | User confirmed/denied destructive action | `{ toolName, allowed }` |

All events are sent via `navigator.sendBeacon()` and never block the main thread.
