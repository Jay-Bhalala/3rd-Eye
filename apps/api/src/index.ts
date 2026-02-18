import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import schemaRoute from "./routes/generate-schema";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use("*", cors({
    origin: (origin) => origin || "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    credentials: true,
}));

// Health check
app.get("/", (c) => {
    return c.json({
        name: "@3rdeye/api",
        version: "0.1.0",
        status: "healthy",
        timestamp: new Date().toISOString(),
    });
});

// Mount routes
app.route("/", schemaRoute);

// Telemetry ingestion endpoint
app.post("/api/v1/telemetry", async (c) => {
    const body = await c.req.json();
    console.log(`📊 Telemetry received:`, JSON.stringify(body).slice(0, 200));
    return c.json({
        received: true,
        eventCount: Array.isArray(body) ? body.length : 1,
    });
});

const port = Number(process.env.PORT) || 3002;
console.log(`🔮 3rd Eye API running on http://localhost:${port}`);

serve({
    fetch: app.fetch,
    port,
});

export default app;

