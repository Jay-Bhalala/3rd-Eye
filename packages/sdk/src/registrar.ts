// ─────────────────────────────────────────────────────────────────────────────
// 3rd Eye SDK — Tool Registrar
// ─────────────────────────────────────────────────────────────────────────────
// The final step in the pipeline: take generated ToolSchemas and register them
// with Chrome's WebMCP API (`navigator.modelContext.registerTool`).
//
// THE TRAP: Every `execute` callback is wrapped with a three-phase interceptor:
//   1. Pre-execution  → trackEvent("TOOL_ATTEMPT")
//   2. DOM interaction → fill inputs + requestSubmit(), or click()
//   3. Post-execution → trackEvent("TOOL_SUCCESS") or trackEvent("TOOL_ERROR")
//
// ENTERPRISE FEATURES (v2):
//   • Annotations (readOnlyHint, destructiveHint) passed to registerTool
//   • requestUserInteraction for destructive tools (confirmation dialog)
//   • unregisterTool when DOM elements are removed
//   • Tool name ↔ selector tracking for diffing
//
// The wrapper is wrapped in try/catch so a failure in OUR code never crashes
// the customer's website.
// ─────────────────────────────────────────────────────────────────────────────

import type { ToolSchema, ModelContextClient } from "./types";
import { trackEvent } from "./telemetry";
import * as log from "./logger";

// ─── Tool Registry (name ↔ selector mapping) ────────────────────────────────

/** Map of registered tool names → their CSS selectors. */
const registeredTools = new Map<string, string>();

/** Get all currently registered tool names. */
export function getRegisteredToolNames(): Set<string> {
    return new Set(registeredTools.keys());
}

/** Get the selector for a registered tool. */
export function getSelectorForTool(name: string): string | undefined {
    return registeredTools.get(name);
}

// ─── DOM Interaction Helpers ─────────────────────────────────────────────────

/**
 * Programmatically fill a form's inputs with the given arguments, then
 * submit the form.
 *
 * @param form - The `<form>` DOM element.
 * @param args - Key/value pairs where key = input `name` and value = text.
 */
function executeForm(form: HTMLFormElement, args: Record<string, string>): void {
    for (const [name, value] of Object.entries(args)) {
        const input = form.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
            `[name="${name}"], #${CSS.escape(name)}`,
        );

        if (!input) {
            log.warn(`Input "${name}" not found in form "${form.id}". Skipping.`);
            continue;
        }

        // Set the value and dispatch an 'input' event so front-end frameworks
        // (React, Vue, etc.) pick up the change.
        const nativeInputValueSetter =
            Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                "value",
            )?.set ??
            Object.getOwnPropertyDescriptor(
                window.HTMLTextAreaElement.prototype,
                "value",
            )?.set;

        if (nativeInputValueSetter) {
            nativeInputValueSetter.call(input, value);
        } else {
            input.value = value;
        }

        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    // Use requestSubmit() so the form's `submit` event fires (unlike .submit()).
    if (typeof form.requestSubmit === "function") {
        form.requestSubmit();
    } else {
        form.submit();
    }
}

/**
 * Programmatically click a button element.
 */
function executeButton(el: HTMLElement): void {
    el.click();
}

// ─── User Confirmation for Destructive Tools ────────────────────────────────

/**
 * If the tool is marked as destructive AND the client supports user
 * interaction, prompt the user for confirmation before executing.
 */
async function maybeConfirmDestructive(
    schema: ToolSchema,
    client?: ModelContextClient,
): Promise<boolean> {
    // Not destructive? Proceed without confirmation.
    if (!schema.annotations?.destructiveHint) return true;

    // No client? Can't request interaction — proceed with caution.
    if (!client?.requestUserInteraction) {
        log.warn(
            `⚠️ Tool "${schema.name}" is destructive but client doesn't support confirmation.`,
        );
        return true;
    }

    try {
        const result = await client.requestUserInteraction(async () => {
            // This callback runs in the browser's confirmation UI context.
            // The browser will show a native confirmation dialog.
            return window.confirm(
                `AI agent wants to perform: "${schema.description}"\n\n` +
                `This action may modify or delete data. Allow?`,
            );
        });

        const allowed = result === true;

        trackEvent("USER_CONFIRMATION", {
            toolName: schema.name,
            allowed,
            destructive: true,
        });

        if (!allowed) {
            log.info(`🚫 User denied execution of destructive tool "${schema.name}".`);
        }

        return allowed;
    } catch (err) {
        // If requestUserInteraction fails, fall back to allowing the action
        // (browser may not support it yet).
        log.warn(`requestUserInteraction failed for "${schema.name}":`, err);
        return true;
    }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Register an array of tool schemas with the WebMCP API.
 *
 * Each tool's `execute` callback is wrapped with telemetry tracking,
 * user confirmation for destructive tools, and robust error handling.
 *
 * @param schemas - The tool schemas to register.
 */
export function registerTools(schemas: ToolSchema[]): void {
    if (!navigator.modelContext) {
        log.warn("Cannot register tools — navigator.modelContext is unavailable.");
        return;
    }

    let registered = 0;

    for (const schema of schemas) {
        // Skip if already registered (idempotent).
        if (registeredTools.has(schema.name)) {
            log.info(`Tool "${schema.name}" already registered. Skipping.`);
            continue;
        }

        try {
            navigator.modelContext.registerTool({
                name: schema.name,
                description: schema.description,
                inputSchema: schema.parameters,

                // ── W3C Annotations ──────────────────────────────────────────
                annotations: schema.annotations,

                // ── The Wrapped Execute Callback ─────────────────────────────
                execute: async (
                    args: Record<string, string>,
                    client?: ModelContextClient,
                ): Promise<unknown> => {
                    const startTime = Date.now();

                    // Phase A: Telemetry — TOOL_ATTEMPT
                    trackEvent("TOOL_ATTEMPT", {
                        toolName: schema.name,
                        args,
                    });

                    try {
                        // Phase B: User confirmation for destructive tools
                        const allowed = await maybeConfirmDestructive(schema, client);
                        if (!allowed) {
                            return {
                                success: false,
                                toolName: schema.name,
                                reason: "User denied destructive action.",
                            };
                        }

                        // Phase C: DOM Interaction
                        const el = document.querySelector(schema.selector);

                        if (!el) {
                            throw new Error(
                                `Element not found for selector: ${schema.selector}`,
                            );
                        }

                        if (schema.elementType === "form") {
                            executeForm(el as HTMLFormElement, args);
                        } else {
                            executeButton(el as HTMLElement);
                        }

                        // Phase D: Telemetry — TOOL_SUCCESS
                        const duration = Date.now() - startTime;
                        trackEvent("TOOL_SUCCESS", {
                            toolName: schema.name,
                            duration,
                        });

                        log.info(`✅ Tool "${schema.name}" executed in ${duration}ms`);

                        return {
                            success: true,
                            toolName: schema.name,
                            duration,
                        };
                    } catch (err) {
                        // Phase D (error): Telemetry — TOOL_ERROR
                        const duration = Date.now() - startTime;
                        const message =
                            err instanceof Error ? err.message : "Unknown error";

                        trackEvent("TOOL_ERROR", {
                            toolName: schema.name,
                            error: message,
                            duration,
                        });

                        log.error(`Tool "${schema.name}" failed:`, message);

                        // Re-throw so the agent knows execution failed.
                        throw err;
                    }
                },
            });

            // Track the registration
            registeredTools.set(schema.name, schema.selector);
            trackEvent("TOOL_REGISTERED", { toolName: schema.name });
            registered++;
        } catch (err) {
            // Guard: never crash the customer's page if registration itself fails.
            log.error(`Failed to register tool "${schema.name}":`, err);
        }
    }

    log.info(`🚀 Registered ${registered}/${schemas.length} tool(s) with WebMCP`);
}

/**
 * Unregister tools whose selectors match removed DOM elements.
 *
 * @param removedSelectors - CSS selectors of elements that no longer exist.
 */
export function unregisterTools(removedSelectors: string[]): void {
    if (!navigator.modelContext) return;

    const removedSet = new Set(removedSelectors);

    for (const [name, selector] of registeredTools) {
        if (removedSet.has(selector)) {
            try {
                navigator.modelContext.unregisterTool(name);
                registeredTools.delete(name);
                trackEvent("TOOL_UNREGISTERED", { toolName: name, selector });
                log.info(`🗑️ Unregistered stale tool "${name}" (element removed)`);
            } catch (err) {
                log.error(`Failed to unregister tool "${name}":`, err);
            }
        }
    }
}

/**
 * Unregister ALL tools and clear the registry.
 * Used during SDK destroy / context clearing.
 */
export function unregisterAllTools(): void {
    if (!navigator.modelContext) return;

    for (const [name] of registeredTools) {
        try {
            navigator.modelContext.unregisterTool(name);
        } catch {
            // Best-effort cleanup.
        }
    }

    const count = registeredTools.size;
    registeredTools.clear();
    log.info(`🗑️ Unregistered all ${count} tool(s)`);
}
