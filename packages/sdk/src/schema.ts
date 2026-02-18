// ─────────────────────────────────────────────────────────────────────────────
// 3rd Eye SDK — Schema Generator (The "Brain" Connection)
// ─────────────────────────────────────────────────────────────────────────────
// Converts scanned DOM elements into WebMCP-compatible tool schemas.
//
// STRATEGY:
//   1. Try the 3rd Eye API first (AI-enhanced via GPT-4o-mini)
//   2. Fall back to local generation if the API is unreachable or errors
//   3. Cache results in localStorage to avoid redundant API calls
// ─────────────────────────────────────────────────────────────────────────────

import type { ScannedElement, ToolSchema, ToolInputSchema, ToolAnnotations } from "./types";
import * as log from "./logger";

// ─── Local Fallback Helpers ──────────────────────────────────────────────────

/**
 * Convert a human-readable string to a snake_case tool name.
 */
function toToolName(raw: string): string {
    return raw
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");
}

/**
 * Generate a JSON Schema from a scanned form's inputs.
 */
function inputsToSchema(element: ScannedElement): ToolInputSchema {
    const properties: ToolInputSchema["properties"] = {};
    const required: string[] = [];

    if (element.inputs) {
        for (const input of element.inputs) {
            properties[input.name] = {
                type: input.inputType === "number" ? "number" : "string",
                description:
                    input.overrideParamDescription ||
                    input.label ||
                    input.placeholder ||
                    `The ${input.name} field (${input.inputType})`,
            };
            if (input.required) required.push(input.name);
        }
    }

    return { type: "object", properties, required };
}

/**
 * Infer annotations from a form's HTTP method.
 * GET → read-only, POST/PUT → open-world, DELETE → destructive.
 */
function inferFormAnnotations(method?: string): ToolAnnotations {
    const m = (method ?? "GET").toUpperCase();
    if (m === "GET") return { readOnlyHint: true, destructiveHint: false };
    if (m === "DELETE") return { destructiveHint: true, readOnlyHint: false };
    return { readOnlyHint: false, openWorldHint: true };
}

function schemaFromForm(element: ScannedElement): ToolSchema {
    const name = element.overrideName ?? toToolName(element.id || "unknown_form");
    const inputCount = element.inputs?.length ?? 0;
    const description = element.overrideDescription ??
        `Submit the "${element.id || "unknown"}" form (${element.method ?? "GET"}, ${inputCount} field${inputCount !== 1 ? "s" : ""})`;
    const annotations = element.overrideAnnotations ?? inferFormAnnotations(element.method);

    return {
        name,
        description,
        parameters: inputsToSchema(element),
        selector: element.selector,
        elementType: "form",
        annotations,
    };
}

/**
 * Infer annotations from button text content.
 * Destructive keywords (delete, remove, cancel) → destructiveHint.
 */
function inferButtonAnnotations(element: ScannedElement): ToolAnnotations {
    const text = (element.ariaLabel || element.textContent || "").toLowerCase();
    const destructiveWords = ["delete", "remove", "cancel", "destroy", "unsubscribe"];
    const readOnlyWords = ["search", "view", "show", "filter", "browse", "find"];

    if (destructiveWords.some((w) => text.includes(w))) {
        return { destructiveHint: true, readOnlyHint: false };
    }
    if (readOnlyWords.some((w) => text.includes(w))) {
        return { readOnlyHint: true, destructiveHint: false };
    }
    return { idempotentHint: true };
}

function schemaFromButton(element: ScannedElement): ToolSchema {
    const label =
        element.ariaLabel || element.textContent || element.id || "unknown_button";
    const name = element.overrideName ?? toToolName(label);
    const description = element.overrideDescription ?? `Click the "${label}" button`;
    const annotations = element.overrideAnnotations ?? inferButtonAnnotations(element);

    return {
        name,
        description,
        parameters: { type: "object", properties: {}, required: [] },
        selector: element.selector,
        elementType: "button",
        annotations,
    };
}

/**
 * Generate schemas locally from element metadata (no API call).
 */
function generateLocalSchemas(elements: ScannedElement[]): ToolSchema[] {
    const schemas: ToolSchema[] = [];
    for (const element of elements) {
        if (element.type === "form") {
            schemas.push(schemaFromForm(element));
        } else if (element.type === "button") {
            schemas.push(schemaFromButton(element));
        }
    }
    return schemas;
}

// ─── Cache ───────────────────────────────────────────────────────────────────

const CACHE_KEY_PREFIX = "__3rdeye_schemas_";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCachedSchemas(): ToolSchema[] | null {
    try {
        if (typeof localStorage === "undefined") return null;

        const key = CACHE_KEY_PREFIX + window.location.pathname;
        const raw = localStorage.getItem(key);
        if (!raw) return null;

        const cached = JSON.parse(raw) as { schemas: ToolSchema[]; timestamp: number };
        if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
            localStorage.removeItem(key);
            return null;
        }

        log.info("📦 Using cached schemas");
        return cached.schemas;
    } catch {
        return null;
    }
}

function cacheSchemas(schemas: ToolSchema[]): void {
    try {
        if (typeof localStorage === "undefined") return;

        const key = CACHE_KEY_PREFIX + window.location.pathname;
        localStorage.setItem(
            key,
            JSON.stringify({ schemas, timestamp: Date.now() }),
        );
    } catch {
        // Storage full or unavailable — silently ignore.
    }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Convert scanned DOM elements into WebMCP tool schemas.
 *
 * **Strategy:**
 *   1. Check localStorage cache first (unless skipCache is true)
 *   2. Try the 3rd Eye API (AI-enhanced via GPT-4o-mini)
 *   3. Fall back to local generation if API is unreachable
 *
 * @param elements   - The output of scanDOM().
 * @param endpoint   - API endpoint (e.g. "http://localhost:3002").
 * @param skipCache  - If true, bypass cache (used by watcher for delta re-scans).
 * @returns Array of ToolSchema.
 */
export async function fetchSchemas(
    elements: ScannedElement[],
    endpoint?: string,
    skipCache = false,
): Promise<ToolSchema[]> {
    // ── 1. Check cache ──────────────────────────────────────────────────────
    if (!skipCache) {
        const cached = getCachedSchemas();
        if (cached) return cached;
    }

    // ── 2. Skip API if every element has developer-provided overrides ───────
    const allOverridden = elements.every((e) => e.overrideName && e.overrideDescription);
    if (allOverridden) {
        const schemas = generateLocalSchemas(elements);
        log.info(
            `🧠 All ${schemas.length} element(s) have declarative overrides — skipping API`,
            schemas,
        );
        return schemas;
    }

    // ── 3. Try API (with 15s timeout) ────────────────────────────────────────
    if (endpoint) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            const pageUrl =
                typeof window !== "undefined" ? window.location.href : "unknown";

            log.info(`🧠 Requesting AI schemas from ${endpoint}...`);

            const response = await fetch(`${endpoint}/api/v1/generate-schema`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pageUrl, elements }),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (response.ok) {
                const data = await response.json();
                const schemas: ToolSchema[] = data.schemas ?? [];

                if (schemas.length > 0) {
                    const source = data.meta?.source ?? "unknown";
                    log.info(
                        `🧠 Received ${schemas.length} schema(s) from API (source: ${source})`,
                        schemas,
                    );
                    cacheSchemas(schemas);
                    return schemas;
                }
            }

            log.warn(`API returned ${response.status}, falling back to local.`);
        } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") {
                log.warn("API request timed out (15s), falling back to local.");
            } else {
                log.warn("API unreachable, falling back to local.");
            }
        }
    }

    // ── 4. Local fallback ───────────────────────────────────────────────────
    const schemas = generateLocalSchemas(elements);
    log.info(`🧠 Generated ${schemas.length} schema(s) locally (fallback)`, schemas);
    return schemas;
}
