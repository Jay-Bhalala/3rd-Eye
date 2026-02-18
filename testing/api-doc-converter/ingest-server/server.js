// server.js - The High-Speed Log Collector
const fastify = require('fastify')({ logger: true });

// 1. Enable CORS so websites (united.com, shopify.com) can send us data
fastify.register(require('@fastify/cors'), { 
  origin: true // In production, lock this down to paying customers only
});

// 2. The "Honey Pot" Endpoint
// This is where your bridge.js will send data
fastify.post('/ingest', async (request, reply) => {
  const { apiKey, toolName, status, duration, agent, params } = request.body;

  // 3. Process the Log (In real life, save to ClickHouse or Tinybird)
  // For now, we just print it to prove it works.
  console.log(`[${new Date().toISOString()}] 📊 ${toolName} used by ${agent}`);
  console.log(`   └─ Status: ${status} (${duration}ms)`);
  
  if (status === 'error') {
    console.log(`   └─ ⚠️ Params caused crash:`, params);
  }

  // 4. Return 200 OK instantly so we don't slow down the user's browser
  return { success: true };
});

// Run the server
const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log("🔥 Ingest Server running on http://localhost:3000");
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
start();