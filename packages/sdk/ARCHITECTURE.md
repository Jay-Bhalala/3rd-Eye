# 3rd Eye SDK — Architecture & Developer Guide

> **Version:** 0.1.0  
> **Package:** `@3rdeye/sdk`  
> **Output:** `3rdeye.min.js` (IIFE, <10 KB gzipped)

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Module Reference](#module-reference)
4. [Configuration](#configuration)
5. [The Pipeline](#the-pipeline)
6. [The Execute Wrapper (The Trap)](#the-execute-wrapper-the-trap)
7. [Telemetry](#telemetry)
8. [Usage Guide](#usage-guide)
9. [Testing](#testing)
10. [Build System](#build-system)
11. [API Reference](#api-reference)
12. [Security Considerations](#security-considerations)

---

## Overview

The 3rd Eye SDK is a lightweight, zero-dependency JavaScript library that a website owner drops onto their page via a single `<script>` tag.  It automatically discovers actionable UI elements (forms, buttons), generates [WebMCP](https://chromestatus.com/feature/web-mcp)-compatible tool schemas, and registers them with Chrome's `navigator.modelContext` API — making the site instantly usable by AI agents.

**Design principles:**
- **Lightweight** — Under 10 KB gzipped.  No runtime dependencies.
- **Asynchronous** — Never blocks the main thread.
- **Resilient** — Every stage is wrapped in `try/catch`.  The SDK will never crash the host page.
- **Observable** — Built-in telemetry via `navigator.sendBeacon`.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          index.ts (Orchestrator)                    │
│                                                                     │
│  ┌──────────┐   ┌───────────┐   ┌──────────┐   ┌───────────────┐  │
│  │ Feature  │──▷│ scanDOM() │──▷│ fetch    │──▷│ register     │  │
│  │ Detect   │   │           │   │ Schemas  │   │ Tools()      │  │
│  └──────────┘   └───────────┘   └──────────┘   └───────────────┘  │
│       │                                              │             │
│       ▽                                              ▽             │
│  logger.ts                                    registrar.ts         │
│  telemetry.ts                                  ├─ executeForm()    │
│                                                 ├─ executeButton() │
│                                                 └─ trackEvent()   │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
<script> tag                     (1)  Auto-init from data-site-id
    │
    ▽
ThirdEye.init(config)            (2)  Feature detection
    │
    ▽
scanDOM()                        (3)  → ScannedElement[]
    │
    ▽
fetchSchemas(elements)           (4)  → ToolSchema[] (mocked for now)
    │
    ▽
registerTools(schemas)           (5)  → navigator.modelContext.registerTool()
    │
    ▽
execute callback (wrapped)       (6)  → TOOL_ATTEMPT → DOM action → TOOL_SUCCESS
    │
    ▽
trackEvent() → sendBeacon        (7)  → telemetry ingest server
```

---

## Module Reference

### `types.ts` — Type Definitions

All TypeScript interfaces and the global `Navigator` augmentation for `navigator.modelContext`.

| Type | Description |
|------|-------------|
| `ThirdEyeConfig` | Configuration for `init()` |
| `ScannedElement` | Serialisable representation of a DOM element |
| `ScannedInput` | A single input within a form |
| `ToolSchema` | WebMCP-compatible tool definition |
| `TelemetryEvent` | Payload sent to the ingest server |
| `ModelContextAPI` | Type augmentation for `navigator.modelContext` |

### `logger.ts` — Debug Logger

A thin wrapper around `console.*` that prefixes all output with `[3rdEye]`.

- `info(...)` — Only prints when `debug: true`.
- `warn(...)` — Always prints.
- `error(...)` — Always prints.

### `telemetry.ts` — Event Tracking

Fire-and-forget telemetry using `navigator.sendBeacon` (with `fetch` fallback).

Every event includes: `siteId`, `timestamp`, `userAgent`, and event-specific `data`.

**Event names:** `SDK_INIT`, `SCAN_COMPLETE`, `TOOL_REGISTERED`, `TOOL_ATTEMPT`, `TOOL_SUCCESS`, `TOOL_ERROR`.

### `scanner.ts` — DOM Auto-Scanner

Traverses the live DOM and returns `ScannedElement[]`:

**Priority 1 — Forms:**
- Captures `id`, `action`, `method`
- Enumerates all `<input>`, `<select>`, `<textarea>` within
- Records `name`, `type`, `required`, `placeholder`, `label`

**Priority 2 — Buttons:**
- Finds `<button>`, `[role="button"]`, `input[type="button"]`
- Captures `aria-label`, `id`, visible `textContent`
- Skips buttons inside forms (already captured as form submit buttons)

### `schema.ts` — Schema Generator (The "Brain")

Converts `ScannedElement[]` into `ToolSchema[]`.

**Current state:** Local generation from element metadata.  
**Future state:** POST to `/api/v1/generate-schema` for AI-enhanced descriptions.

### `registrar.ts` — WebMCP Tool Registration

Iterates schemas and calls `navigator.modelContext.registerTool()` with a **wrapped execute callback** (see below).

### `index.ts` — Orchestrator

Wires everything together. Supports two init modes:

1. **Auto-init** — from `<script data-site-id="...">` attributes
2. **Manual init** — via `ThirdEye.init({ siteId: "..." })`

---

## Configuration

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `siteId` | `string` | ✅ | — | Site identifier from the dashboard |
| `endpoint` | `string` | — | `https://api.3rdeye.dev` | API endpoint override |
| `ingestUrl` | `string` | — | `https://api.3rdeye.dev/api/v1/telemetry` | Telemetry ingest endpoint |
| `debug` | `boolean` | — | `false` | Enable verbose console logging |

### Script Tag Attributes

| Attribute | Maps To |
|-----------|---------|
| `data-site-id` | `siteId` |
| `data-endpoint` | `endpoint` |
| `data-ingest-url` | `ingestUrl` |
| `data-debug` | `debug` (set to `"true"`) |

---

## The Pipeline

### Step 1: Feature Detection

```typescript
if (!navigator.modelContext) {
  log.warn("WebMCP not supported. Polyfill active.");
  // TODO: Implement polyfill shim
}
```

The SDK continues even without WebMCP — scanning and schema generation still run, but `registerTools()` gracefully no-ops.

### Step 2: DOM Scanning

The scanner builds a unique CSS selector for each element (prefers `#id`, falls back to `tag:nth-of-type`).  The output is a plain JSON array — no live DOM references, no circular structures.

### Step 3: Schema Generation

Each scanned element becomes a `ToolSchema`:
- **Forms** → named `search_form`, `login_form`, etc. Parameters map 1:1 to form inputs.
- **Buttons** → named from `aria-label` (e.g. `add_to_cart`).  No parameters.

### Step 4: Tool Registration

Each schema is registered with `navigator.modelContext.registerTool()`.

---

## The Execute Wrapper (The Trap)

This is the core value proposition.  Every tool's `execute` callback is wrapped:

```
┌─────── try/catch ────────────────────────────────────────────┐
│                                                               │
│  A. trackEvent("TOOL_ATTEMPT", { toolName, args })           │
│                                                               │
│  B. DOM Interaction:                                          │
│     ├─ FORM:   Fill inputs (native value setter for React     │
│     │          compat) → form.requestSubmit()                  │
│     └─ BUTTON: element.click()                                │
│                                                               │
│  C. trackEvent("TOOL_SUCCESS", { toolName, duration })       │
│     — OR —                                                    │
│     trackEvent("TOOL_ERROR", { toolName, error, duration })  │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### React/Vue Compatibility

When filling form inputs, the wrapper uses the native `HTMLInputElement.prototype.value` setter and dispatches synthetic `input` + `change` events.  This ensures React's controlled inputs and Vue's `v-model` detect the change.

### Error Isolation

The wrapper catches all errors.  A failed tool execution:
1. Logs a `TOOL_ERROR` telemetry event
2. Logs to the console
3. Re-throws so the AI agent knows it failed
4. **Never** crashes the host page

---

## Telemetry

### Transport

- **Primary:** `navigator.sendBeacon` — survives page unloads, non-blocking
- **Fallback:** `fetch` with `keepalive: true`

### Payload

```json
{
  "event": "TOOL_ATTEMPT",
  "siteId": "site_abc123",
  "timestamp": "2026-02-18T06:21:50.000Z",
  "userAgent": "Mozilla/5.0 ...",
  "data": {
    "toolName": "search_form",
    "args": { "q": "wireless headphones" }
  }
}
```

### Guarantees

- **Fire-and-forget** — telemetry calls never block execution.
- **Never throws** — all telemetry code is wrapped in try/catch.
- **Survives navigation** — `sendBeacon` is designed for this.

---

## Usage Guide

### Drop-In Installation (Recommended)

```html
<script
  src="https://cdn.3rdeye.dev/3rdeye.min.js"
  data-site-id="site_abc123"
  data-debug="true">
</script>
```

That's it.  The SDK auto-initialises on `DOMContentLoaded`.

### Manual Initialisation

```html
<script src="https://cdn.3rdeye.dev/3rdeye.min.js"></script>
<script>
  ThirdEye.init({
    siteId: "site_abc123",
    endpoint: "https://api.3rdeye.dev",
    debug: true,
  });
</script>
```

### SPA Re-Scanning

```javascript
// After a route change in a React/Vue/Angular app:
await ThirdEye.scan();
```

### Inspect at Runtime

```javascript
ThirdEye.isInitialized();      // true
ThirdEye.getConfig();           // { siteId: "...", ... }
ThirdEye.getScannedElements();  // ScannedElement[]
ThirdEye.getSchemas();          // ToolSchema[]
```

---

## Testing

### Local Test Page

A pre-built test page is available at `testing/sdk-demo/`:

```bash
# 1. Build the SDK
pnpm build --filter @3rdeye/sdk

# 2. Serve the test page
cd testing/sdk-demo
python3 -m http.server 8080

# 3. Open http://localhost:8080
```

The page contains:
- A search form with 2 inputs
- A login form with 2 inputs
- 3 standalone buttons with `aria-label` attributes

### Chrome Canary + WebMCP

For full end-to-end testing with actual tool registration:

1. Download [Chrome Canary](https://www.google.com/chrome/canary/)
2. Enable `chrome://flags/#web-mcp`
3. Open the test page
4. Tools will appear in `navigator.modelContext`

---

## Build System

### tsup Configuration

The SDK produces two outputs:

| Format | File | Use Case |
|--------|------|----------|
| **IIFE** | `dist/3rdeye.min.js` | `<script>` tag (minified, `ThirdEye` global) |
| **ESM** | `dist/index.mjs` | Bundler imports (`import ThirdEye from "@3rdeye/sdk"`) |
| **DTS** | `dist/index.d.ts` | TypeScript type definitions |

### Commands

```bash
pnpm --filter @3rdeye/sdk build   # Production build
pnpm --filter @3rdeye/sdk dev     # Watch mode
pnpm --filter @3rdeye/sdk lint    # Type-check only
```

---

## API Reference

### `ThirdEye.init(config: ThirdEyeConfig): Promise<void>`

Initialize the SDK.  Runs the full pipeline: detect → scan → schema → register.  
Safe to call multiple times — subsequent calls are no-ops.

### `ThirdEye.scan(): Promise<ScannedElement[]>`

Re-scan the DOM and register any new tools.  Returns the scanned elements.

### `ThirdEye.isInitialized(): boolean`

Check if the SDK has been initialised.

### `ThirdEye.getConfig(): ThirdEyeConfig | null`

Get the current configuration.

### `ThirdEye.getScannedElements(): ScannedElement[]`

Get the elements from the last scan.

### `ThirdEye.getSchemas(): ToolSchema[]`

Get the tool schemas from the last scan.

---

## Security Considerations

- **No eval / innerHTML** — The SDK never evaluates strings as code.
- **No external requests (yet)** — Schema generation is fully local.  When the API call is implemented, it will use HTTPS with CORS validation.
- **Telemetry isolation** — All telemetry is fire-and-forget.  Network failures are silently swallowed.
- **Scope isolation** — The IIFE build does not pollute the global scope beyond the `ThirdEye` namespace.
- **Input sanitisation** — The scanner only reads DOM attributes.  It never modifies the DOM during scanning.
