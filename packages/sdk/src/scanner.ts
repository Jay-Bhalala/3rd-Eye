// ─────────────────────────────────────────────────────────────────────────────
// 3rd Eye SDK — DOM Scanner
// ─────────────────────────────────────────────────────────────────────────────
// Traverses the live DOM and returns a lightweight, serialisable inventory of
// "actionable elements" — forms and buttons that an AI agent can interact with.
//
// The scanner runs once at init and can be re-invoked if the page mutates
// (e.g. SPA navigation).  It produces ZERO side-effects on the DOM.
// ─────────────────────────────────────────────────────────────────────────────

import type { ScannedElement, ScannedInput } from "./types";
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

// ─── Scanners ────────────────────────────────────────────────────────────────

/**
 * Scan all `<form>` elements and return structured representations.
 */
function scanForms(): ScannedElement[] {
    const forms = document.querySelectorAll<HTMLFormElement>("form");
    const results: ScannedElement[] = [];

    forms.forEach((form) => {
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

            inputs.push({
                name,
                inputType: input instanceof HTMLInputElement ? input.type : input.tagName.toLowerCase(),
                required: input.required,
                placeholder: input instanceof HTMLInputElement ? input.placeholder || undefined : undefined,
                label: findLabelText(input),
            });
        });

        results.push({
            type: "form",
            id: form.id || undefined,
            selector: buildSelector(form),
            action: form.action || undefined,
            method: (form.method || "GET").toUpperCase(),
            inputs,
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
        const ariaLabel = el.getAttribute("aria-label") ?? undefined;
        const textContent = el.textContent?.trim() || undefined;
        const id = el.id || undefined;

        // Skip buttons with no semantic meaning — we can't generate a schema
        if (!ariaLabel && !id && !textContent) return;

        // Skip form-internal submit buttons (already captured by form scan)
        if (el.closest("form")) return;

        results.push({
            type: "button",
            id,
            selector: buildSelector(el),
            ariaLabel,
            textContent,
        });
    });

    return results;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Scan the current DOM for actionable elements.
 *
 * @returns An array of {@link ScannedElement} objects — lightweight JSON,
 *          safe to serialise and send to the schema generation API.
 */
export function scanDOM(): ScannedElement[] {
    const forms = scanForms();
    const buttons = scanButtons();

    const all = [...forms, ...buttons];

    log.info(
        `🔍 Scanner found ${forms.length} form(s) and ${buttons.length} button(s)`,
        all,
    );

    return all;
}
