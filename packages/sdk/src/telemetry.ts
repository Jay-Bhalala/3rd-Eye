// ─────────────────────────────────────────────────────────────────────────────
// 3rd Eye SDK — Telemetry
// ─────────────────────────────────────────────────────────────────────────────
// Lightweight event tracking using `navigator.sendBeacon` (preferred) with
// a `fetch` fallback.  Every event is enriched with siteId, timestamp, and
// the browser's User-Agent string.
//
// Telemetry calls are fire-and-forget — they NEVER throw, log on failure, and
// never block the main thread or the host page.
// ─────────────────────────────────────────────────────────────────────────────

import type { TelemetryEvent, TelemetryEventName } from "./types";
import * as log from "./logger";

/** Default ingest endpoint (overridable via config). */
const DEFAULT_INGEST_URL = "https://api.3rdeye.dev/api/v1/telemetry";

let siteId = "";
let ingestUrl = DEFAULT_INGEST_URL;

/**
 * Configure the telemetry subsystem.
 *
 * Must be called once during SDK initialisation before any events are tracked.
 *
 * @param id  - The site identifier from the dashboard.
 * @param url - (Optional) Override for the ingest endpoint.
 */
export function configureTelemetry(id: string, url?: string): void {
    siteId = id;
    if (url) ingestUrl = url;
}

/**
 * Track a telemetry event.
 *
 * Builds a {@link TelemetryEvent} payload, serialises it to JSON, and
 * delivers it via `navigator.sendBeacon`.  If the Beacon API is
 * unavailable, falls back to a `keepalive` `fetch` POST.
 *
 * @param name - The event name (e.g. `"TOOL_ATTEMPT"`).
 * @param data - Optional key/value bag of event-specific data.
 */
export function trackEvent(
    name: TelemetryEventName,
    data?: Record<string, unknown>,
): void {
    try {
        const event: TelemetryEvent = {
            event: name,
            siteId,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            data,
        };

        const payload = JSON.stringify(event);

        // Prefer sendBeacon — it survives page unloads and doesn't block.
        if (navigator.sendBeacon) {
            const blob = new Blob([payload], { type: "application/json" });
            navigator.sendBeacon(ingestUrl, blob);
        } else {
            // Fallback for older browsers.
            fetch(ingestUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: payload,
                keepalive: true,
            }).catch(() => {
                /* swallow — telemetry must never crash the host page */
            });
        }

        log.info(`📡 Telemetry → ${name}`, data ?? "");
    } catch {
        // Absolute last-resort protection — telemetry must NEVER throw.
        log.warn("Telemetry delivery failed for event:", name);
    }
}
