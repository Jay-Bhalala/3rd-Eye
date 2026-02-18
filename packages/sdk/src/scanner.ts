// ─────────────────────────────────────────────────────────────────────────────
// 3rd Eye SDK — DOM Scanner
// ─────────────────────────────────────────────────────────────────────────────
// Traverses the live DOM and returns a lightweight, serialisable inventory of
// "actionable elements" — forms and buttons that an AI agent can interact with.
//
// The scanner runs once at init and can be re-invoked if the page mutates
// (e.g. SPA navigation).  It produces ZERO side-effects on the DOM.
// ─────────────────────────────────────────────────────────────────────────────

import type { ScannedElement, ScannedInput, ToolAnnotations } from "./types";
import * as log from "./logger";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a unique CSS selector for a given element.
 *
 * Prefers `#id` selectors.  Falls back to a positional `tag:nth-of-type(n)`.
 */
function buildSelector(el: Element): string {
    if (el.id) return `#${el.id}`;

    const tag = el.tagName.toLowerCase();
    const parent = el.parentElement;

    if (!parent) return tag;

    const siblings = Array.from(parent.children).filter(
        (s) => s.tagName === el.tagName,
    );

    if (siblings.length === 1) return `${buildSelector(parent)} > ${tag}`;

    const idx = siblings.indexOf(el) + 1;
    return `${buildSelector(parent)} > ${tag}:nth-of-type(${idx})`;
}

/**
 * Find the `<label>` text associated with an input via `for` attribute or by
 * walking up to a wrapping `<label>`.
 */
function findLabelText(input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string | undefined {
    // Explicit <label for="…">
    if (input.id) {
        const label = document.querySelector<HTMLLabelElement>(`label[for="${input.id}"]`);
        if (label) return label.textContent?.trim();
    }

    // Wrapping <label>
    const parent = input.closest("label");
    if (parent) return parent.textContent?.trim();

    return undefined;
}

// ─── Declarative Attribute Helpers ────────────────────────────────────────────

/** Selectors that are already covered by `scanForms()` and `scanButtons()`. */
const STANDARD_SELECTORS = 'form, button, [role="button"], input[type="button"], input[type="submit"]';

/**
 * Check if an element has `data-tool-ignore` and should be excluded.
 */
function isIgnored(el: Element): boolean {
    return el.hasAttribute("data-tool-ignore");
}

/**
 * Read `data-tool-*` declarative attributes from any element and return
 * the override fields for a {@link ScannedElement}.
 */
function readToolAttributes(el: Element): {
    overrideName?: string;
    overrideDescription?: string;
    overrideAnnotations?: ToolAnnotations;
} {
    const name = el.getAttribute("data-tool-name") ?? undefined;
    const description = el.getAttribute("data-tool-description") ?? undefined;

    // Build annotations only if at least one hint attribute is present
    const hasReadOnly = el.hasAttribute("data-tool-readonly");
    const hasDestructive = el.hasAttribute("data-tool-destructive");
    const hasIdempotent = el.hasAttribute("data-tool-idempotent");
    const hasOpenWorld = el.hasAttribute("data-tool-open-world");

    let annotations: ToolAnnotations | undefined;
    if (hasReadOnly || hasDestructive || hasIdempotent || hasOpenWorld) {
        annotations = {};
        if (hasReadOnly) annotations.readOnlyHint = true;
        if (hasDestructive) annotations.destructiveHint = true;
        if (hasIdempotent) annotations.idempotentHint = true;
        if (hasOpenWorld) annotations.openWorldHint = true;
    }

    return {
        overrideName: name,
        overrideDescription: description,
        overrideAnnotations: annotations,
    };
}

// ─── Scanners ────────────────────────────────────────────────────────────────

/**
 * Scan all `<form>` elements and return structured representations.
 */
function scanForms(): ScannedElement[] {
    const forms = document.querySelectorAll<HTMLFormElement>("form");
    const results: ScannedElement[] = [];

    forms.forEach((form) => {
        // Skip elements explicitly excluded by the developer
        if (isIgnored(form)) return;

        // Read declarative overrides from data-tool-* attributes
        const overrides = readToolAttributes(form);

        // Collect inputs, selects, and textareas
        const inputEls = form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
            "input, select, textarea",
        );

        const inputs: ScannedInput[] = [];
        inputEls.forEach((input) => {
            // Skip hidden/submit/button types — they aren't user-facing parameters
            if (input instanceof HTMLInputElement) {
                const skip = ["hidden", "submit", "button", "reset", "image"];
                if (skip.includes(input.type)) return;
            }

            const name = input.name || input.id || "";
            if (!name) return; // Unnamed inputs can't be targeted

            // Read optional data-tool-param override for parameter description
            const overrideParamDescription =
                input.getAttribute("data-tool-param") ?? undefined;

            inputs.push({
                name,
                inputType: input instanceof HTMLInputElement ? input.type : input.tagName.toLowerCase(),
                required: input.required,
                placeholder: input instanceof HTMLInputElement ? input.placeholder || undefined : undefined,
                label: findLabelText(input),
                overrideParamDescription,
            });
        });

        results.push({
            type: "form",
            id: form.id || undefined,
            selector: buildSelector(form),
            action: form.action || undefined,
            method: (form.method || "GET").toUpperCase(),
            inputs,
            ...overrides,
        });
    });

    return results;
}

/**
 * Scan buttons with descriptive attributes (`aria-label`, meaningful `id`,
 * or visible text).
 */
function scanButtons(): ScannedElement[] {
    // Regular buttons + anchor elements with role="button"
    const candidates = document.querySelectorAll<HTMLElement>(
        'button, [role="button"], input[type="button"], input[type="submit"]',
    );

    const results: ScannedElement[] = [];

    candidates.forEach((el) => {
        // Skip elements explicitly excluded by the developer
        if (isIgnored(el)) return;

        // Read declarative overrides from data-tool-* attributes
        const overrides = readToolAttributes(el);

        const ariaLabel = el.getAttribute("aria-label") ?? undefined;
        const textContent = el.textContent?.trim() || undefined;
        const id = el.id || undefined;

        // Skip buttons with no semantic meaning — we can't generate a schema
        // (unless the developer has provided a data-tool-name override)
        if (!overrides.overrideName && !ariaLabel && !id && !textContent) return;

        // Skip form-internal submit buttons (already captured by form scan)
        if (el.closest("form")) return;

        results.push({
            type: "button",
            id,
            selector: buildSelector(el),
            ariaLabel,
            textContent,
            ...overrides,
        });
    });

    return results;
}

/**
 * Scan elements that are NOT standard `<form>` or button elements but have
 * been explicitly annotated by the developer with `data-tool-name`.
 *
 * This catches `<div>`, `<a>`, `<span>`, and any other non-standard element.
 * They are treated as click-to-execute tools (type: "button").
 */
function scanAnnotated(): ScannedElement[] {
    const candidates = document.querySelectorAll<HTMLElement>("[data-tool-name]");
    const results: ScannedElement[] = [];

    candidates.forEach((el) => {
        // Skip elements explicitly excluded
        if (isIgnored(el)) return;

        // Skip elements already covered by scanForms() and scanButtons()
        if (el.matches(STANDARD_SELECTORS) || el.closest("form")) return;

        const overrides = readToolAttributes(el);
        const ariaLabel = el.getAttribute("aria-label") ?? undefined;
        const textContent = el.textContent?.trim() || undefined;
        const id = el.id || undefined;

        results.push({
            type: "button",
            id,
            selector: buildSelector(el),
            ariaLabel,
            textContent,
            ...overrides,
        });
    });

    return results;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Scan the current DOM for actionable elements.
 *
 * Discovers elements via three passes:
 *   1. Standard `<form>` elements
 *   2. Standard buttons (`<button>`, `[role="button"]`, etc.)
 *   3. Non-standard elements annotated with `data-tool-name`
 *
 * All passes honour `data-tool-ignore` (excluded) and `data-tool-*`
 * declarative overrides for names, descriptions, and annotations.
 *
 * @returns An array of {@link ScannedElement} objects — lightweight JSON,
 *          safe to serialise and send to the schema generation API.
 */
export function scanDOM(): ScannedElement[] {
    const forms = scanForms();
    const buttons = scanButtons();
    const annotated = scanAnnotated();

    const all = [...forms, ...buttons, ...annotated];

    log.info(
        `🔍 Scanner found ${forms.length} form(s), ${buttons.length} button(s), and ${annotated.length} annotated element(s)`,
        all,
    );

    return all;
}
