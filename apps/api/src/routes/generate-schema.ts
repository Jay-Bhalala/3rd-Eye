// ─────────────────────────────────────────────────────────────────────────────
// 3rd Eye API — Schema Generation Route
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/generate-schema
//
// Accepts scanned DOM elements from the SDK and returns AI-enhanced
// WebMCP tool schemas.  Falls back to local generation if OpenAI is
// unavailable or errors out.
// ─────────────────────────────────────────────────────────────────────────────

import { Hono } from "hono";
import { generateSchemas, isAIAvailable } from "../lib/openai";

// ─── Types (minimal, matches SDK) ────────────────────────────────────────────

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

interface ToolSchema {
    name: string;
    description: string;
    parameters: ToolInputSchema;
    selector: string;
    elementType: "form" | "button";
}

// ─── Local Fallback Generator ────────────────────────────────────────────────

function toToolName(raw: string): string {
    return raw
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");
}

function localSchemaFromForm(el: ScannedElement): ToolSchema {
    const name = toToolName(el.id || "unknown_form");
    const properties: Record<string, SchemaProperty> = {};
    const required: string[] = [];

    if (el.inputs) {
        for (const input of el.inputs) {
            properties[input.name] = {
                type: input.inputType === "number" ? "number" : "string",
                description:
                    input.label ||
                    input.placeholder ||
                    `The ${input.name} field (${input.inputType})`,
            };
            if (input.required) required.push(input.name);
        }
    }

    const inputCount = el.inputs?.length ?? 0;
    return {
        name,
        description: `Submit the "${el.id || "unknown"}" form (${el.method ?? "GET"}, ${inputCount} field${inputCount !== 1 ? "s" : ""})`,
        parameters: { type: "object", properties, required },
        selector: el.selector,
        elementType: "form",
    };
}

function localSchemaFromButton(el: ScannedElement): ToolSchema {
    const label =
        el.ariaLabel || el.textContent || el.id || "unknown_button";
    return {
        name: toToolName(label),
        description: `Click the "${label}" button`,
        parameters: { type: "object", properties: {}, required: [] },
        selector: el.selector,
        elementType: "button",
    };
}

function generateLocalSchemas(elements: ScannedElement[]): ToolSchema[] {
    return elements.map((el) =>
        el.type === "form" ? localSchemaFromForm(el) : localSchemaFromButton(el),
    );
}

// ─── Route ───────────────────────────────────────────────────────────────────

const schemaRoute = new Hono();

schemaRoute.post("/api/v1/generate-schema", async (c) => {
    const startTime = Date.now();

    try {
        const body = await c.req.json();
        const { siteId, pageUrl, elements } = body as {
            siteId?: string;
            pageUrl?: string;
            elements?: ScannedElement[];
        };

        if (!elements || !Array.isArray(elements) || elements.length === 0) {
            return c.json(
                { error: "Missing or empty 'elements' array in request body." },
                400,
            );
        }

        let schemas: ToolSchema[];
        let source: "ai" | "local";

        // Try AI generation first
        if (isAIAvailable()) {
            try {
                console.log(
                    `🧠 AI generating schemas for ${elements.length} element(s)...`,
                );
                schemas = await generateSchemas(elements, pageUrl);
                source = "ai";
                console.log(
                    `✅ AI generated ${schemas.length} schema(s) in ${Date.now() - startTime}ms`,
                );
            } catch (aiError) {
                console.error("⚠️  AI generation failed, falling back to local:", aiError);
                schemas = generateLocalSchemas(elements);
                source = "local";
            }
        } else {
            schemas = generateLocalSchemas(elements);
            source = "local";
        }

        return c.json({
            schemas,
            meta: {
                source,
                siteId: siteId || null,
                pageUrl: pageUrl || null,
                elementCount: elements.length,
                schemaCount: schemas.length,
                durationMs: Date.now() - startTime,
            },
        });
    } catch (error) {
        console.error("Schema generation error:", error);
        return c.json(
            {
                error: "Schema generation failed.",
                details: error instanceof Error ? error.message : "Unknown error",
            },
            500,
        );
    }
});

export default schemaRoute;
