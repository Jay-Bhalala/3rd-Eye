// ─────────────────────────────────────────────────────────────────────────────
// 3rd Eye SDK — Live DOM Watcher
// ─────────────────────────────────────────────────────────────────────────────
// Uses MutationObserver to detect when elements are added or removed from the
// DOM (modals, AJAX content, SPA route changes).  When changes are detected:
//
//   • NEW elements → scan → generate schemas → register tools
//   • REMOVED elements → unregister stale tools
//
// Also listens for SPA navigation events (popstate, hashchange) to trigger
// a full re-scan when the "page" changes without a real page load.
//
// All re-scans are DEBOUNCED (300ms) to avoid hammering the pipeline when
// frameworks like React re-render dozens of nodes in rapid succession.
// ─────────────────────────────────────────────────────────────────────────────

import type { ScannedElement, ToolSchema, ThirdEyeConfig } from "./types";
import { scanDOM } from "./scanner";
import { fetchSchemas } from "./schema";
import { registerTools, unregisterTools, getRegisteredToolNames } from "./registrar";
import { trackEvent } from "./telemetry";
import * as log from "./logger";

// ─── Internal State ──────────────────────────────────────────────────────────

let observer: MutationObserver | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let currentSelectors = new Set<string>();
let currentUrl = "";
let config: ThirdEyeConfig | null = null;

const DEBOUNCE_MS = 300;

// ─── Diffing Logic ──────────────────────────────────────────────────────────

/**
 * Compare old selectors with new scanned elements to find what was
 * added and what was removed.
 */
function diffSelectors(
    newElements: ScannedElement[],
): { added: ScannedElement[]; removedSelectors: string[] } {
    const newSelectors = new Set(newElements.map((e) => e.selector));

    const added = newElements.filter((e) => !currentSelectors.has(e.selector));
    const removedSelectors = [...currentSelectors].filter(
        (sel) => !newSelectors.has(sel),
    );

    return { added, removedSelectors };
}

// ─── Re-scan Pipeline ────────────────────────────────────────────────────────

/**
 * Debounced re-scan triggered by DOM mutations or SPA navigation.
 * Only processes the DIFF — doesn't re-register tools that already exist.
 */
async function handleDOMChange(reason: "mutation" | "navigation"): Promise<void> {
    if (!config) return;

    try {
        // Step 1: Re-scan the entire DOM
        const allElements = scanDOM();
        const { added, removedSelectors } = diffSelectors(allElements);

        // Nothing changed? Bail early.
        if (added.length === 0 && removedSelectors.length === 0) return;

        log.info(
            `🔄 DOM ${reason}: +${added.length} new, -${removedSelectors.length} removed`,
        );

        trackEvent("DOM_MUTATION", {
            reason,
            added: added.length,
            removed: removedSelectors.length,
        });

        // Step 2: Unregister tools for REMOVED elements
        if (removedSelectors.length > 0) {
            // Find tool names that map to removed selectors
            const registeredNames = getRegisteredToolNames();
            // We need to find which tool names correspond to removed selectors
            // The registrar tracks name↔selector mapping
            unregisterTools(removedSelectors);
        }

        // Step 3: Register tools for NEW elements
        if (added.length > 0) {
            const newSchemas = await fetchSchemas(added, config.endpoint, true);
            registerTools(newSchemas);
        }

        // Update the current state
        currentSelectors = new Set(allElements.map((e) => e.selector));
    } catch (err) {
        log.error("Watcher re-scan failed:", err);
    }
}

/**
 * Debounced trigger — waits for mutations to settle before re-scanning.
 */
function debouncedRescan(reason: "mutation" | "navigation"): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => handleDOMChange(reason), DEBOUNCE_MS);
}

// ─── SPA Navigation Handlers ────────────────────────────────────────────────

function handleNavigation(): void {
    const newUrl = window.location.href;
    if (newUrl === currentUrl) return;

    log.info(`🧭 SPA navigation detected: ${currentUrl} → ${newUrl}`);
    trackEvent("SPA_NAVIGATE", { from: currentUrl, to: newUrl });
    currentUrl = newUrl;

    debouncedRescan("navigation");
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Start watching for DOM changes and SPA navigation events.
 *
 * Call this AFTER the initial scan + register cycle completes.
 *
 * @param sdkConfig - The SDK configuration (needed for API endpoint).
 * @param initialSelectors - Selectors from the initial scan.
 */
export function startWatching(
    sdkConfig: ThirdEyeConfig,
    initialSelectors: string[],
): void {
    if (observer) {
        log.warn("Watcher already running.");
        return;
    }

    config = sdkConfig;
    currentSelectors = new Set(initialSelectors);
    currentUrl = window.location.href;

    // ── MutationObserver ─────────────────────────────────────────────────
    observer = new MutationObserver((mutations) => {
        // Quick check: did any mutation actually add or remove element nodes?
        const hasRelevantChange = mutations.some((m) =>
            m.addedNodes.length > 0 || m.removedNodes.length > 0,
        );

        if (hasRelevantChange) {
            debouncedRescan("mutation");
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });

    // ── SPA Navigation Events ────────────────────────────────────────────
    window.addEventListener("popstate", handleNavigation);
    window.addEventListener("hashchange", handleNavigation);

    log.info("👁️ Live watcher started (MutationObserver + SPA navigation)");
}

/**
 * Stop watching and clean up all event listeners.
 */
export function stopWatching(): void {
    if (observer) {
        observer.disconnect();
        observer = null;
    }

    if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
    }

    window.removeEventListener("popstate", handleNavigation);
    window.removeEventListener("hashchange", handleNavigation);

    currentSelectors.clear();
    config = null;

    log.info("👁️ Live watcher stopped");
}

/**
 * Check if the watcher is currently active.
 */
export function isWatching(): boolean {
    return observer !== null;
}
