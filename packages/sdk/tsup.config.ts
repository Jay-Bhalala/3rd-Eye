import { defineConfig } from "tsup";

export default defineConfig([
    // ESM build for bundlers
    {
        entry: ["src/index.ts"],
        format: ["esm"],
        dts: true,
        sourcemap: true,
        clean: true,
        outDir: "dist",
    },
    // IIFE build → 3rdeye.min.js for <script> tags
    {
        entry: { "3rdeye.min": "src/index.ts" },
        format: ["iife"],
        globalName: "ThirdEye",
        minify: true,
        sourcemap: true,
        outDir: "dist",
        outExtension: () => ({ js: ".js" }),
    },
]);
