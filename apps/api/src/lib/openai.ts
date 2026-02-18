// ─────────────────────────────────────────────────────────────────────────────
// 3rd Eye API — OpenAI Integration
// ─────────────────────────────────────────────────────────────────────────────
// Thin wrapper around the OpenAI SDK that takes scanned DOM elements and
// returns semantically rich WebMCP tool schemas.
//
// Uses gpt-4o-mini for cost efficiency (~$0.00015 per request).
// ─────────────────────────────────────────────────────────────────────────────

import OpenAI from "openai";

// ─── Types (mirrored from SDK — kept minimal to avoid cross-package dep) ─────

interface ScannedInput {
    name: string;
    inputType: string;
    required: boolean;
    placeholder?: string;
    label?: string;
}

interface ScannedElement {
    type: "form" | "button";
    id?: string;
    selector: string;
    action?: string;
    method?: string;
    inputs?: ScannedInput[];
    ariaLabel?: string;
    textContent?: string;
}

interface SchemaProperty {
    type: string;
    description: string;
}

interface ToolInputSchema {
    type: "object";
    properties: Record<string, SchemaProperty>;
    required: string[];
}

interface ToolAnnotations {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
}

interface ToolSchema {
    name: string;
    description: string;
    parameters: ToolInputSchema;
    selector: string;
    elementType: "form" | "button";
    annotations?: ToolAnnotations;
}

// ─── OpenAI Client ───────────────────────────────────────────────────────────

let client: OpenAI | null = null;

function getClient(): OpenAI | null {
    if (client) return client;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === "sk-your-key-here") {
        console.warn("⚠️  OPENAI_API_KEY not set — AI schema generation disabled.");
        return null;
    }

    client = new OpenAI({ apiKey });
    return client;
}

// ─── System Prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are 3rd Eye's Schema Generator — an expert at converting raw HTML element metadata into clean, semantic WebMCP tool definitions.

You receive an array of scanned DOM elements (forms and buttons) from a website. Your job is to generate a WebMCP-compatible tool schema for each element.

RULES:
1. Tool names must be snake_case, descriptive, and action-oriented (e.g. "search_products", "submit_login", "add_to_cart").
2. Tool descriptions must be human-readable sentences that explain what the tool does in the context of the website. Be specific and helpful.
3. For forms: generate a parameter for each input. Use the label/placeholder/name to write a clear description.
4. For buttons: generate zero parameters. The description should explain what clicking the button does.
5. Keep the "selector" and "elementType" fields exactly as provided in the input — do NOT modify them.
6. For each tool, include an "annotations" object with these W3C WebMCP safety hints:
   - "readOnlyHint": true if the tool only reads/searches/filters data (GET forms, search buttons)
   - "destructiveHint": true if the tool deletes/removes/cancels something irreversible
   - "idempotentHint": true if calling the tool multiple times has the same effect (toggles, refreshes)
   - "openWorldHint": true if the tool interacts with external services (login, payment, API calls)
7. Output ONLY a valid JSON array of tool schemas. No markdown, no explanation, no code fences.

SCHEMA FORMAT (each item in the array):
{
  "name": "snake_case_tool_name",
  "description": "A clear sentence describing what this tool does",
  "parameters": {
    "type": "object",
    "properties": {
      "param_name": { "type": "string", "description": "Clear description" }
    },
    "required": ["param_name"]
  },
  "selector": "#original-selector",
  "elementType": "form" | "button",
  "annotations": {
    "readOnlyHint": false,
    "destructiveHint": false,
    "idempotentHint": false,
    "openWorldHint": false
  }
}`;

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Generate AI-enhanced tool schemas from scanned DOM elements.
 *
 * @param elements - Array of scanned DOM elements from the SDK.
 * @param pageUrl  - The URL of the page being scanned (for context).
 * @returns Array of WebMCP tool schemas with AI-generated names/descriptions.
 * @throws If OpenAI API call fails — caller should handle fallback.
 */
export async function generateSchemas(
    elements: ScannedElement[],
    pageUrl?: string,
): Promise<ToolSchema[]> {
    const openai = getClient();

    if (!openai) {
        throw new Error("OpenAI client not available — API key not configured.");
    }

    const userMessage = JSON.stringify(
        {
            pageUrl: pageUrl || "unknown",
            elements,
        },
        null,
        2,
    );

    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2, // Low temp for consistent, predictable output
        max_tokens: 2000,
        response_format: { type: "json_object" },
        messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMessage },
        ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
        throw new Error("OpenAI returned empty response.");
    }

    // Parse the response — handle both { schemas: [...] } and bare [...]
    const parsed = JSON.parse(content);
    const schemas: ToolSchema[] = Array.isArray(parsed)
        ? parsed
        : parsed.schemas ?? parsed.tools ?? [];

    // Safety: ensure selector and elementType are preserved from original input
    for (let i = 0; i < schemas.length && i < elements.length; i++) {
        schemas[i].selector = elements[i].selector;
        schemas[i].elementType = elements[i].type;
    }

    return schemas;
}

/**
 * Check if AI schema generation is available (API key is configured).
 */
export function isAIAvailable(): boolean {
    return getClient() !== null;
}
