A drop-in analytics and control layer for AI Agents using the WebMCP protocol.

## Prerequisites
* **Node.js** (v18+)
* **Chrome Canary** (with `chrome://flags/#web-mcp` enabled)
* A local web server (Python or Node)

## 1. Start the Ingest Server (Backend)
This receives analytics logs from the browser.

```bash
cd ingest-server
npm install
node server.js
# Output: 🔥 Ingest Server running on http://localhost:3000

cd agent-bridge
# Using Python (Recommended)
python3 -m http.server 8000

3. Verify Installation
Open Chrome Canary.

Go to http://localhost:8000.

Open DevTools (F12) -> Console.

Success: WebMCP Bridge: Successfully registered 20 tools!

Check the Ingest Server Terminal.

Success: [Data] 📊 findPetsByStatus used by Mozilla/5.0...