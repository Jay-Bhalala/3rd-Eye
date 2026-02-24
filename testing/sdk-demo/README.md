# 🧪 SDK Demo — Test Page

A standalone HTML page for testing the 3rd Eye SDK in a real browser. Covers all 8 stages of the pipeline including AI schema generation, live watcher, annotations, and tool unregistration.

## Quick Start

```bash
# 1. Build the SDK
cd /path/to/3rd-Eye
pnpm --filter @3rdeye/sdk build

# 2. Copy built SDK to this directory
cp packages/sdk/dist/3rdeye.min.js testing/sdk-demo/

# 3. (Optional) Start the API server for AI schemas
cd apps/api && pnpm dev
# → 🔮 3rd Eye API running on http://localhost:3002

# 4. Serve this directory (in a separate terminal)
cd testing/sdk-demo
python3 -m http.server 8080

# 5. Open http://localhost:8080 in Chrome Canary
#    Open DevTools → Console
```

---

## Expected Console Output

### Without WebMCP (any browser)
```
[3rdEye] Initializing with config: {siteId: "test_site_001", debug: true, …}
[3rdEye] WebMCP not supported in this browser. Polyfill active.
[3rdEye] 🔍 Scanner found 2 form(s) and 3 button(s)
[3rdEye] 🧠 Received 5 schema(s) from API (source: ai)     ← if API running
[3rdEye] 🧠 Generated 5 schema(s) locally (fallback)        ← if no API
[3rdEye] 👁️ Live watcher started (MutationObserver + SPA navigation)
```

### With WebMCP (Chrome Canary + `chrome://flags/#web-mcp` enabled)
```
[3rdEye] 🚀 Registered 5/5 tool(s) with WebMCP
[3rdEye] 📄 Provided page context to AI agent
[3rdEye] 👁️ Live watcher started (MutationObserver + SPA navigation)
```

---

## Test Scenarios

### 1. Live Watcher — Add Element

Paste in DevTools Console:

```js
document.body.appendChild(Object.assign(document.createElement('button'), {
  id: 'test-live',
  textContent: 'Live Button',
  ariaLabel: 'Live Button'
}))
```

**Expected:**
```
[3rdEye] 🔄 DOM mutation: +1 new, -0 removed
[3rdEye] 🚀 Registered 1/1 tool(s) with WebMCP
```

### 2. Live Watcher — Remove Element

```js
document.getElementById('test-live').remove()
```

**Expected:**
```
[3rdEye] 🔄 DOM mutation: +0 new, -1 removed
[3rdEye] 🗑️ Unregistered stale tool "live_button" (element removed)
```

### 3. Destructive Tool — "Delete" Button

```js
document.body.appendChild(Object.assign(document.createElement('button'), {
  id: 'delete-everything',
  textContent: 'Delete Everything',
  ariaLabel: 'Delete Everything'
}))
```

**Expected:** The generated schema will have `annotations.destructiveHint: true`. When an AI agent calls this tool, the SDK will trigger a browser confirmation dialog via `requestUserInteraction`.

### 4. Declarative Overrides — Verify Override Schemas

The test page includes 3 declarative override examples built-in. After SDK init, verify:

```js
// Should include "submit_feedback" (from data-tool-name on feedback form)
// Should include "open_support_chat" (from data-tool-name on a <div>)
ThirdEye.getSchemas().map(s => s.name)

// Admin button should NOT appear (has data-tool-ignore)
ThirdEye.getSchemas().find(s => s.name === 'admin_panel')  // → undefined
```

**Expected:** `submit_feedback` has `openWorldHint: true` (from `data-tool-open-world`). `open_support_chat` has `readOnlyHint: true` (from `data-tool-readonly`).

### 5. SPA Navigation

```js
// Simulate SPA route change
window.history.pushState({}, '', '/new-route')
window.dispatchEvent(new PopStateEvent('popstate'))
```

**Expected:**
```
[3rdEye] 🧭 SPA navigation detected
[3rdEye] 🔄 DOM mutation: ...
```

### 6. SDK Destroy

```js
ThirdEye.destroy()
```

**Expected:**
```
[3rdEye] 💀 Destroying SDK...
[3rdEye] 👁️ Live watcher stopped
[3rdEye] 🗑️ Unregistered all 5 tool(s)
[3rdEye] 🧹 Cleared page context
[3rdEye] 💀 SDK destroyed
```

### 7. Clear Schema Cache

```js
localStorage.clear()  // Clear cached AI schemas
location.reload()     // Reload to re-generate
```

---

## Verify Programmatically

```js
ThirdEye.getScannedElements()   // Array of 5 scanned elements
ThirdEye.getSchemas()           // Array of 5 schemas with annotations
ThirdEye.isWatcherActive()      // true
ThirdEye.isInitialized()        // true

// Check annotations on a specific schema
ThirdEye.getSchemas()[0].annotations
// → { readOnlyHint: true, destructiveHint: false, ... }
```

---

## Page Contents

| Element | Type | ID | Scanner Finds | Expected Annotation |
|---------|------|----|---------------|-------------------|
| Product search | `<form>` | `search-form` | 2 inputs: `q`, `category` | `readOnlyHint: true` |
| User login | `<form>` | `login-form` | 2 inputs: `email`, `password` | `openWorldHint: true` |
| Add to Cart | `<button>` | `add-to-cart` | `aria-label="Add to Cart"` | `idempotentHint: true` |
| Subscribe | `<button>` | `subscribe-btn` | `aria-label="Subscribe to Newsletter"` | `openWorldHint: true` |
| Dark Mode | `<button>` | `dark-mode-toggle` | `aria-label="Toggle Dark Mode"` | `idempotentHint: true` |
| **Feedback form** | `<form>` | `feedback-form` | `data-tool-name="submit_feedback"` + 2 inputs with `data-tool-param` | `openWorldHint: true` (override) |
| **Support chat** | `<div>` | `chat-widget` | `data-tool-name="open_support_chat"` (non-standard element) | `readOnlyHint: true` (override) |
| **Admin button** | `<button>` | `admin-btn` | `data-tool-ignore` — **excluded from scanning** | N/A |

---

## Configuration

The test page's `<script>` tag is pre-configured:

```html
<script
  src="3rdeye.min.js"
  data-site-id="test_site_001"
  data-endpoint="http://localhost:3002"
  data-ingest-url="http://localhost:3002/api/v1/telemetry"
  data-debug="true"
></script>
```

- **`data-endpoint`**: Points to the local API server for AI schemas
- **`data-ingest-url`**: Points to the local telemetry endpoint
- **`data-debug`**: Enables verbose logging so you can see everything in console
