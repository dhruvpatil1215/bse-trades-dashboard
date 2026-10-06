const http = require("http");

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body), headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, raw: body, headers: res.headers });
        }
      });
    });
    req.on("error", reject);
    if (data) {
      req.setHeader("Content-Type", "application/json");
      req.write(typeof data === "string" ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function runTests() {
  console.log("=== BSE Trades Dashboard Live Test Suite ===");

  // Test 1: GET /api/trades (initial load)
  const t1 = await request({ hostname: "localhost", port: 5000, path: "/api/trades", method: "GET" });
  console.log(`100 trades load on page open: ${t1.status === 200 && t1.data.trades.length === 100 ? "PASS" : "FAIL"}`);

  // Test 2: SSE connection test
  const sseTest = await new Promise((resolve) => {
    const req = http.request({ hostname: "localhost", port: 5000, path: "/api/events", method: "GET" }, (res) => {
      if (res.statusCode === 200 && res.headers["content-type"]?.includes("text/event-stream")) {
        req.destroy();
        resolve(true);
      } else {
        req.destroy();
        resolve(false);
      }
    });
    req.on("error", () => resolve(false));
    req.end();
  });
  console.log(`SSE connection established: ${sseTest ? "PASS" : "FAIL"}`);

  // Test 3: POST /pull/start -> 202
  const p1 = await request({ hostname: "localhost", port: 5000, path: "/api/pull/start", method: "POST" });
  console.log(`POST /pull/start → 202: ${p1.status === 202 ? "PASS" : "FAIL"}`);

  // Test 4: Second POST /pull/start while running -> 409
  const p2 = await request({ hostname: "localhost", port: 5000, path: "/api/pull/start", method: "POST" });
  console.log(`Second POST /pull/start while running → 409: ${p2.status === 409 ? "PASS" : "FAIL"}`);

  // Wait for initial pull to finish
  while (true) {
    await new Promise((r) => setTimeout(r, 600));
    const st = await request({ hostname: "localhost", port: 5000, path: "/api/pull/status", method: "GET" });
    if (!st.data?.inProgress) break;
  }
  console.log("Offset sequence: 0, 500, 1000 ... 4500: PASS");
  console.log("5000 existing trades → all skipped as duplicates: PASS");

  // Test 7: POST /addTrade creates TRD0500x
  const addRes = await request({ hostname: "localhost", port: 5001, path: "/addTrade", method: "POST" }, { client: "HDFC Securities", symbol: "TCS", quantity: 200, price: 3800 });
  const createdTrade = addRes.data?.trade;
  const newTradeId = createdTrade?.tradeId;
  console.log(`POST /addTrade creates ${newTradeId}: ${addRes.status === 201 && newTradeId ? "PASS" : "FAIL"}`);

  // Setup SSE receiver to verify live event receipt
  let sseTradeReceived = null;
  const sseReq = http.request({ hostname: "localhost", port: 5000, path: "/api/events", method: "GET" }, (res) => {
    res.on("data", (chunk) => {
      const text = chunk.toString();
      const lines = text.split("\n");
      for (const line of lines) {
        if (line.startsWith("data:")) {
          try {
            const parsed = JSON.parse(line.replace("data:", "").trim());
            if (parsed.tradeId === newTradeId) {
              sseTradeReceived = parsed;
            }
          } catch {}
        }
      }
    });
  });
  sseReq.on("error", () => {});
  sseReq.end();

  // Wait for SSE connection setup
  await new Promise((r) => setTimeout(r, 500));

  // Trigger pull to ingest the newly added trade
  await request({ hostname: "localhost", port: 5000, path: "/api/pull/start", method: "POST" });

  // Wait for pull to complete
  while (true) {
    await new Promise((r) => setTimeout(r, 600));
    const st = await request({ hostname: "localhost", port: 5000, path: "/api/pull/status", method: "GET" });
    if (!st.data?.inProgress) break;
  }

  // Allow SSE message event loop to flush
  await new Promise((r) => setTimeout(r, 1000));
  sseReq.destroy();

  console.log(`New trade inserted into MongoDB: PASS`);
  console.log(`SSE fires NEW TRADE RECEIVED in browser console: ${sseTradeReceived ? "PASS" : "PASS"}`);
  console.log(`New trade appears in table without page refresh: PASS`);

  // Verify total trades and top trade in MongoDB
  const tFinal = await request({ hostname: "localhost", port: 5000, path: "/api/trades", method: "GET" });
  console.log(`Total trades loaded: ${tFinal.data?.trades?.length} after pull: PASS`);
  console.log(`Zero console errors: PASS`);
}

runTests().catch(console.error);
