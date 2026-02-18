// ─────────────────────────────────────────────────────────────────────────────
// 3rd Eye SDK — Main Entry Point
// ─────────────────────────────────────────────────────────────────────────────
//
//   ┌──────────┐     ┌──────────┐     ┌──────────────┐     ┌────────────┐
//   │  init()  │ ──▷ │ scanDOM  │ ──▷ │ fetchSchemas │ ──▷ │ register   │
//   │          │     │          │     │              │     │ Tools      │
//   └──────────┘     └──────────┘     └──────────────┘     └────────────┘
//        │                                                       │
//        ▽                                                       ▽
//   Feature Detection                                    navigator.modelContext
//   + Config Resolution                                  .registerTool()
//   + provideContext()                                         │
//                                                              ▽
//                                                    ┌────────────────────┐
//                                                    │  Live Watcher      │
//                                                    │  (MutationObserver │
//                                                    │  + SPA navigation) │
//                                                    └────────────────────┘
//
// 8-Stage Architecture:
//   1. Feature Detect      → Check navigator.modelContext
//   2. Provide Context     → Send page metadata (title, URL, description)
//   3. Smart Scan          → Find forms + buttons
//   4. Brain Generation    → API → Schemas + Annotations
//   5. Register            → registerTool() with annotations
//   6. Live Watcher        → MutationObserver + SPA events
//   7. Un-Register         → Remove stale tools (handled by watcher)
//   8. Execute Wrapper     → Intercept + User Confirmation + Telemetry
// ─────────────────────────────────────────────────────────────────────────────

import type { ThirdEyeConfig, ScannedElement, ToolSchema } from "./types";
import * as log from "./logger";
import { configureTelemetry, trackEvent } from "./telemetry";
import { scanDOM } from "./scanner";
import { fetchSchemas } from "./schema";
import { registerTools, unregisterAllTools } from "./registrar";
import { startWatching, stopWatching, isWatching } from "./watcher";

// Re-export types for ESM consumers
export type { ThirdEyeConfig, ScannedElement, ToolSchema, ToolAnnotations } from "./types";

// ─── SDK Class ───────────────────────────────────────────────────────────────

/**
 * The 3rd Eye SDK singleton.
 *
 * Orchestrates the full 8-stage lifecycle:
 * 1. Configuration parsing & validation
 * 2. Feature detection (WebMCP / `navigator.modelContext`)
 * 3. Context provisioning (page metadata for agents)
 * 4. DOM scanning
 * 5. Schema generation (AI-first, local fallback)
 * 6. Tool registration with annotations + user confirmation
 * 7. Live watching (MutationObserver + SPA navigation)
 * 8. Cleanup & destroy
 *
 * @example
 * ```html
 * <!-- Auto-init via data attributes -->
 * <script src="3rdeye.min.js" data-site-id="site_abc123"></script>
 *
 * <!-- Or manual init -->
 * <script>
 *   ThirdEye.init({ siteId: "site_abc123", debug: true });
 * </script>
 * ```
 */
export class ThirdEyeSDK {
    private config: ThirdEyeConfig | null = null;
    private initialized = false;
    private scannedElements: ScannedElement[] = [];
    private registeredSchemas: ToolSchema[] = [];

    // ── Initialisation ──────────────────────────────────────────────────────

    /**
     * Initialise the 3rd Eye SDK.
     *
     * This is the main entry point.  It performs feature detection, provides
     * page context, scans the DOM, generates schemas, registers tools, and
     * starts the live watcher.
     *
     * Safe to call multiple times — subsequent calls are no-ops.
     *
     * @param config - SDK configuration.  `siteId` is required.
     */
    async init(config: ThirdEyeConfig): Promise<void> {
        if (this.initialized) {
            log.warn("SDK already initialized.");
            return;
        }

        // ── Validate ────────────────────────────────────────────────────────
        if (!config.siteId) {
            log.error("Missing required `siteId`. Aborting.");
            return;
        }

        this.config = config;
        this.initialized = true;

        // ── Configure subsystems ────────────────────────────────────────────
        log.setDebug(config.debug ?? false);
        configureTelemetry(config.siteId, config.ingestUrl);

        log.info("Initializing with config:", config);
        trackEvent("SDK_INIT", { endpoint: config.endpoint });

        // ── Stage 1: Feature Detection ──────────────────────────────────────
        if (!navigator.modelContext) {
            log.warn(
                "WebMCP not supported in this browser. Polyfill active.",
            );
        }

        // ── Pipeline ────────────────────────────────────────────────────────
        try {
            // Stage 3: Scan the DOM
            this.scannedElements = scanDOM();
            trackEvent("SCAN_COMPLETE", { elementCount: this.scannedElements.length });

            if (this.scannedElements.length === 0) {
                log.info("No actionable elements found. Nothing to register.");
                return;
            }

            // Stage 4: Generate schemas (AI-first, with annotations)
            this.registeredSchemas = await fetchSchemas(
                this.scannedElements,
                config.endpoint,
            );

            // Stage 5: Register with WebMCP (annotations + user confirmation)
            registerTools(this.registeredSchemas);

            // Stage 6: Provide page context (after tools are registered)
            this.providePageContext();

            // Stage 7: Start live watcher (MutationObserver + SPA events)
            const selectors = this.scannedElements.map((e) => e.selector);
            startWatching(config, selectors);

        } catch (err) {
            // The SDK must NEVER crash the host page.
            log.error("Pipeline error:", err);
        }
    }

    // ── Context Provisioning ────────────────────────────────────────────────

    /**
     * Send page-level metadata to AI agents via navigator.modelContext.
     * Chrome's ProvideContextParams requires a `tools` array.
     */
    private providePageContext(): void {
        if (!navigator.modelContext?.provideContext) return;

        try {
            const meta = document.querySelector<HTMLMetaElement>(
                'meta[name="description"]',
            );

            // Chrome's provideContext expects: { tools: [...], ... }
            // We pass an empty tools array — tools are already registered
            // via registerTool(). The context provides supplementary metadata.
            navigator.modelContext.provideContext({
                tools: [],
                title: document.title,
                url: window.location.href,
                description: meta?.content ?? "",
            });

            log.info("📄 Provided page context to AI agent");
        } catch (err) {
            // provideContext may not be fully implemented yet — that's OK.
            log.warn("provideContext not available:", err);
        }
    }

    // ── Public Accessors ────────────────────────────────────────────────────

    /**
     * Re-scan the DOM and register any new tools.
     *
     * Useful for SPAs where the page content changes without a full reload.
     */
    async scan(): Promise<ScannedElement[]> {
        if (!this.initialized || !this.config) {
            log.warn("Cannot scan — SDK not initialized. Call init() first.");
            return [];
        }

        try {
            this.scannedElements = scanDOM();
            trackEvent("SCAN_COMPLETE", { elementCount: this.scannedElements.length });

            this.registeredSchemas = await fetchSchemas(
                this.scannedElements,
                this.config.endpoint,
            );

            registerTools(this.registeredSchemas);
        } catch (err) {
            log.error("Re-scan error:", err);
        }

        return this.scannedElements;
    }

    /**
     * Fully destroy the SDK: unregister all tools, stop the watcher,
     * clear context, and reset state.
     */
    destroy(): void {
        log.info("💀 Destroying SDK...");

        // Stop the live watcher
        if (isWatching()) {
            stopWatching();
        }

        // Unregister all tools
        unregisterAllTools();

        // Clear context
        if (navigator.modelContext?.clearContext) {
            try {
                navigator.modelContext.clearContext();
                log.info("🧹 Cleared page context");
            } catch {
                // Best-effort cleanup.
            }
        }

        // Reset state
        this.config = null;
        this.initialized = false;
        this.scannedElements = [];
        this.registeredSchemas = [];

        log.info("💀 SDK destroyed");
    }

    /** Whether the SDK has been initialised. */
    isInitialized(): boolean {
        return this.initialized;
    }

    /** The current configuration, or `null` if not initialised. */
    getConfig(): ThirdEyeConfig | null {
        return this.config;
    }

    /** The elements found during the last scan. */
    getScannedElements(): ScannedElement[] {
        return this.scannedElements;
    }

    /** The schemas generated from the last scan. */
    getSchemas(): ToolSchema[] {
        return this.registeredSchemas;
    }

    /** Whether the live DOM watcher is currently active. */
    isWatcherActive(): boolean {
        return isWatching();
    }
}

// ─── Singleton & Convenience Exports ─────────────────────────────────────────

const instance = new ThirdEyeSDK();

export const init = instance.init.bind(instance);
export const scan = instance.scan.bind(instance);
export const destroy = instance.destroy.bind(instance);
export const isInitialized = instance.isInitialized.bind(instance);
export const getConfig = instance.getConfig.bind(instance);
export const getScannedElements = instance.getScannedElements.bind(instance);
export const getSchemas = instance.getSchemas.bind(instance);
export const isWatcherActive = instance.isWatcherActive.bind(instance);

export default instance;

// ─── Auto-initialisation from <script> data attributes ───────────────────────
//
// When loaded as a <script> tag:
//   <script src="3rdeye.min.js" data-site-id="site_abc" data-debug="true"></script>
//
// The SDK will automatically initialize without any additional JS.

if (typeof document !== "undefined" && document.currentScript) {
    const script = document.currentScript;
    const siteId = script.getAttribute("data-site-id");

    if (siteId) {
        const config: ThirdEyeConfig = {
            siteId,
            endpoint: script.getAttribute("data-endpoint") ?? undefined,
            ingestUrl: script.getAttribute("data-ingest-url") ?? undefined,
            debug: script.getAttribute("data-debug") === "true",
        };

        // Wait for DOM to be fully parsed before scanning.
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", () => {
                instance.init(config);
            });
        } else {
            // DOM already ready (script was deferred or dynamically injected).
            instance.init(config);
        }
    }
}
