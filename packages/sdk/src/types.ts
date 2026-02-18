// ─────────────────────────────────────────────────────────────────────────────
// 3rd Eye SDK — Type Definitions
// ─────────────────────────────────────────────────────────────────────────────
// All shared interfaces, types, and global augmentations for the SDK.
// This file contains zero runtime code — it is purely declarative.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Configuration ───────────────────────────────────────────────────────────

/**
 * Configuration object passed to `ThirdEye.init()`.
 *
 * Can be provided programmatically or inferred from `<script>` tag attributes:
 * ```html
 * <script src="3rdeye.min.js" data-site-id="site_abc123" data-debug="true"></script>
 * ```
 */
export interface ThirdEyeConfig {
    /** Unique site identifier issued from the 3rd Eye dashboard. */
    siteId: string;

    /** Override the API endpoint (defaults to `https://api.3rdeye.dev`). */
    endpoint?: string;

    /** Override the telemetry ingest URL. */
    ingestUrl?: string;

    /** Enable verbose console logging. Defaults to `false`. */
    debug?: boolean;
}

// ─── DOM Scanner ─────────────────────────────────────────────────────────────

/** The type of DOM element that was scanned. */
export type ScannedElementType = "form" | "button";

/** A single `<input>`, `<select>`, or `<textarea>` within a scanned form. */
export interface ScannedInput {
    /** The input's `name` attribute (used as the parameter key). */
    name: string;

    /** The HTML input type (e.g. `"text"`, `"email"`, `"password"`). */
    inputType: string;

    /** Whether the input has the `required` attribute. */
    required: boolean;

    /** The `placeholder` attribute, if present. */
    placeholder?: string;

    /** The associated `<label>` text, if found. */
    label?: string;

    /** Developer-provided parameter description via `data-tool-param`. */
    overrideParamDescription?: string;
}

/**
 * Lightweight JSON representation of an actionable DOM element discovered
 * by the scanner.  Designed to be serializable (no circular references,
 * no live DOM nodes).
 */
export interface ScannedElement {
    /** Discriminator: `"form"` or `"button"`. */
    type: ScannedElementType;

    /** The element's `id` attribute, if present. */
    id?: string;

    /** CSS selector that uniquely identifies this element in the page. */
    selector: string;

    // ── Form-specific fields ─────────────────────────────────────────────────

    /** The `<form>` `action` attribute. */
    action?: string;

    /** The `<form>` `method` attribute (`GET` | `POST`). */
    method?: string;

    /** Inputs within the form. */
    inputs?: ScannedInput[];

    // ── Button-specific fields ───────────────────────────────────────────────

    /** The `aria-label` of the button, if present. */
    ariaLabel?: string;

    /** Visible text content of the button. */
    textContent?: string;

    // ── Declarative overrides (from `data-tool-*` HTML attributes) ────────────

    /** Developer-provided tool name via `data-tool-name`. */
    overrideName?: string;

    /** Developer-provided description via `data-tool-description`. */
    overrideDescription?: string;

    /** Developer-provided annotations via `data-tool-readonly`, etc. */
    overrideAnnotations?: ToolAnnotations;
}

// ─── Tool Annotations (W3C WebMCP Spec) ──────────────────────────────────────

/**
 * Metadata hints that tell AI agents how "safe" a tool is.
 *
 * Based on the W3C Web Model Context Protocol specification:
 * - `readOnlyHint`   → tool only reads data, never modifies
 * - `destructiveHint` → tool may delete or irreversibly modify data
 * - `idempotentHint`  → calling multiple times has same effect as once
 * - `openWorldHint`   → tool interacts with external systems
 */
export interface ToolAnnotations {
    /** Tool only reads data (e.g. search, browse, filter). */
    readOnlyHint?: boolean;
    /** Tool may delete or irreversibly modify data (e.g. delete account). */
    destructiveHint?: boolean;
    /** Calling multiple times has same effect as calling once (e.g. toggle). */
    idempotentHint?: boolean;
    /** Tool interacts with external services beyond this page. */
    openWorldHint?: boolean;
}

// ─── Tool Schemas ────────────────────────────────────────────────────────────

/** JSON Schema property descriptor for a single tool parameter. */
export interface SchemaProperty {
    type: string;
    description: string;
}

/** JSON Schema object describing a tool's expected input. */
export interface ToolInputSchema {
    type: "object";
    properties: Record<string, SchemaProperty>;
    required: string[];
}

/**
 * A WebMCP-compatible tool schema, ready for registration with
 * `navigator.modelContext.registerTool()`.
 */
export interface ToolSchema {
    /** Machine-readable tool name (e.g. `"search_products"`). */
    name: string;

    /** Human-readable description of what the tool does. */
    description: string;

    /** JSON Schema describing the tool's input parameters. */
    parameters: ToolInputSchema;

    /** CSS selector of the DOM element this tool maps to. */
    selector: string;

    /** Whether the target element is a form or a button. */
    elementType: ScannedElementType;

    /** W3C WebMCP annotations — safety hints for AI agents. */
    annotations?: ToolAnnotations;
}

// ─── Telemetry ───────────────────────────────────────────────────────────────

/** Known telemetry event names. */
export type TelemetryEventName =
    | "SDK_INIT"
    | "SCAN_COMPLETE"
    | "TOOL_REGISTERED"
    | "TOOL_UNREGISTERED"
    | "TOOL_ATTEMPT"
    | "TOOL_SUCCESS"
    | "TOOL_ERROR"
    | "DOM_MUTATION"
    | "SPA_NAVIGATE"
    | "USER_CONFIRMATION";

/** Payload sent with every telemetry beacon. */
export interface TelemetryEvent {
    /** The event name. */
    event: TelemetryEventName;

    /** Site identifier. */
    siteId: string;

    /** ISO 8601 timestamp. */
    timestamp: string;

    /** The browser's User-Agent string. */
    userAgent: string;

    /** Event-specific data. */
    data?: Record<string, unknown>;
}

// ─── WebMCP Global Augmentation ──────────────────────────────────────────────

/**
 * Augment the global `Navigator` interface to include the Chrome WebMCP API.
 *
 * This allows TypeScript to recognise `navigator.modelContext` without
 * compiler errors, while remaining fully optional at runtime.
 */

/** WebMCP tool definition accepted by `navigator.modelContext.registerTool()`. */
export interface WebMCPToolDefinition {
    name: string;
    description: string;
    inputSchema: ToolInputSchema;
    annotations?: ToolAnnotations;
    execute: (
        args: Record<string, string>,
        client?: ModelContextClient,
    ) => Promise<unknown>;
}

/** The client object passed to execute callbacks for user interaction. */
export interface ModelContextClient {
    /** Request user confirmation/interaction during tool execution. */
    requestUserInteraction(
        callback: () => Promise<unknown>,
    ): Promise<unknown>;
}

/** The `navigator.modelContext` API surface (W3C WebMCP spec). */
export interface ModelContextAPI {
    /** Register a tool with the browser's AI agent. */
    registerTool(tool: WebMCPToolDefinition): void;

    /** Unregister a previously registered tool by name. */
    unregisterTool(name: string): void;

    /** Provide page-level context metadata to AI agents. */
    provideContext(context: Record<string, unknown>): void;

    /** Clear all provided context and unregister all tools. */
    clearContext(): void;
}

declare global {
    interface Navigator {
        modelContext?: ModelContextAPI;
    }
}
