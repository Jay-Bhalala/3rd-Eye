// ─────────────────────────────────────────────────────────────────────────────
// 3rd Eye SDK — Logger
// ─────────────────────────────────────────────────────────────────────────────
// A thin, debug-aware logging utility.  All messages are prefixed with
// `[3rdEye]` so they are easy to find in DevTools.
//
// When `debug` mode is OFF, only `warn` and `error` calls produce output.
// When `debug` mode is ON, `info` calls are also printed.
// ─────────────────────────────────────────────────────────────────────────────

const PREFIX = "[3rdEye]";

let debugEnabled = false;

/**
 * Enable or disable verbose debug logging.
 *
 * @param enabled - `true` to print `info`-level messages; `false` to suppress.
 */
export function setDebug(enabled: boolean): void {
    debugEnabled = enabled;
}

/**
 * Log an informational message (only visible when debug mode is ON).
 */
export function info(...args: unknown[]): void {
    if (debugEnabled) {
        console.log(PREFIX, ...args);
    }
}

/**
 * Log a warning (always visible).
 */
export function warn(...args: unknown[]): void {
    console.warn(PREFIX, ...args);
}

/**
 * Log an error (always visible).
 */
export function error(...args: unknown[]): void {
    console.error(PREFIX, ...args);
}
