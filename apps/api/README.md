# 🔮 @3rdeye/api — Schema Generation & Telemetry API

Hono-powered API server that provides AI-enhanced schema generation via GPT-4o-mini and telemetry ingestion for the 3rd Eye SDK.

## Setup

### 1. Install dependencies

```bash
# From monorepo root
pnpm install
```

### 2. Configure environment

```bash
cd apps/api
cp .env.example .env
```

Edit `.env` and add your OpenAI API key:

```env
OPENAI_API_KEY=sk-your-key-here
PORT=3002
```

> **Get a key:** [platform.openai.com/api-keys](https://platform.openai.com/api-keys)

### 3. Start the server

```bash
pnpm dev
# → 🔮 3rd Eye API running on http://localhost:3002
```

---

## API Endpoints

### `GET /health`

Health check endpoint.

```bash
curl http://localhost:3002/health
# → { "status": "ok" }
```

---

### `POST /api/v1/generate-schema`

Generate AI-enhanced WebMCP tool schemas from scanned DOM elements.

**Request Body:**

```json
{
  "pageUrl": "https://example.com/products",
  "elements": [
    {
      "type": "form",
      "id": "search-form",
      "selector": "#search-form",
      "action": "/search",
      "method": "GET",
      "inputs": [
        {
          "name": "q",
          "inputType": "text",
          "required": true,
          "label": "Search products"
        }
      ]
    },
    {
      "type": "button",
      "id": "delete-account",
      "selector": "#delete-account",
      "ariaLabel": "Delete Account",
      "textContent": "Delete My Account"
    }
  ]
}
```

**Response (200 OK):**

```json
{
  "schemas": [
    {
      "name": "search_products",
      "description": "Search for products by entering a query term",
      "parameters": {
        "type": "object",
        "properties": {
          "q": {
            "type": "string",
            "description": "The search query to find products"
          }
        },
        "required": ["q"]
      },
      "selector": "#search-form",
      "elementType": "form",
      "annotations": {
        "readOnlyHint": true,
        "destructiveHint": false,
        "idempotentHint": true,
        "openWorldHint": false
      }
    },
    {
      "name": "delete_account",
      "description": "Permanently delete the user's account",
      "parameters": {
        "type": "object",
        "properties": {},
        "required": []
      },
      "selector": "#delete-account",
      "elementType": "button",
      "annotations": {
        "readOnlyHint": false,
        "destructiveHint": true,
        "idempotentHint": false,
        "openWorldHint": false
      }
    }
  ],
  "meta": {
    "source": "ai",
    "elementCount": 2,
    "generatedAt": "2026-02-18T08:30:00.000Z"
  }
}
```

**Error Handling:**

| Status | Cause | SDK Behavior |
|--------|-------|-------------|
| 200 + empty schemas | AI returned no results | Falls back to local |
| 500 | OpenAI API error | Falls back to local |
| Timeout (15s) | Slow AI response | Falls back to local |
| Network error | Server unreachable | Falls back to local |
| N/A (not called) | All elements have `data-tool-name` + `data-tool-description` | SDK skips API entirely |

---

### `POST /api/v1/telemetry`

Ingest telemetry events from the SDK. Accepts `application/json` or `text/plain` (for `sendBeacon`).

**Request Body:**

```json
{
  "event": "TOOL_REGISTERED",
  "siteId": "site_abc123",
  "timestamp": "2026-02-18T08:30:00.000Z",
  "userAgent": "Mozilla/5.0 ...",
  "data": {
    "toolName": "search_products"
  }
}
```

**Supported Events:** `SDK_INIT`, `SCAN_COMPLETE`, `TOOL_REGISTERED`, `TOOL_UNREGISTERED`, `TOOL_ATTEMPT`, `TOOL_SUCCESS`, `TOOL_ERROR`, `DOM_MUTATION`, `SPA_NAVIGATE`, `USER_CONFIRMATION`

---

## OpenAI Integration

### How It Works

1. The SDK sends scanned DOM element metadata to `/api/v1/generate-schema`
2. The API formats this into a prompt for GPT-4o-mini
3. GPT generates semantic tool names, descriptions, and **W3C safety annotations**
4. The API validates the response, preserves original selectors, and returns schemas

### System Prompt

The GPT-4o-mini system prompt instructs the model to:
- Generate snake_case, action-oriented tool names (`search_products`, not `form_1`)
- Write human-readable descriptions explaining what each tool does
- Infer W3C WebMCP annotations for each tool:
  - `readOnlyHint` — search, browse, filter operations
  - `destructiveHint` — delete, remove, cancel operations
  - `idempotentHint` — toggle, refresh operations
  - `openWorldHint` — login, payment, external API calls
- Preserve the original CSS selectors and element types

### Cost

| Model | Cost per Request | Cache TTL |
|-------|-----------------|-----------|
| GPT-4o-mini | ~$0.00015 | 5 minutes (client-side `localStorage`) |

### Without an API Key

If `OPENAI_API_KEY` is not set or is invalid:
- The `/api/v1/generate-schema` endpoint returns a 500 error
- The SDK **automatically falls back** to local schema generation
- Local schemas use rule-based annotation inference (HTTP method + button text)
- No functionality is lost — only schema quality is reduced

---

## Project Structure

```
apps/api/
├── src/
│   ├── index.ts                # Server entry point (Hono + CORS + logging)
│   ├── lib/
│   │   └── openai.ts           # OpenAI client, system prompt, generateSchemas()
│   └── routes/
│       └── generate-schema.ts  # POST /api/v1/generate-schema route
├── .env                        # Environment variables (gitignored)
├── .env.example                # Template for .env
├── package.json                # Dependencies and scripts
└── tsconfig.json               # TypeScript configuration
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | Yes (for AI) | — | OpenAI API key for GPT-4o-mini |
| `PORT` | No | `3002` | Server port |
