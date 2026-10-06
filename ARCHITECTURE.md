# BSE Trades Dashboard — Architecture & Design Specification

## System Overview

The BSE Trades Dashboard provides real-time trade monitoring for high-frequency equity trading data from the Bombay Stock Exchange (BSE). The architecture is designed around four key operational constraints:

1. **High Ingestion Throughput**: Ingestion of historical and intraday records in batches without degrading database responsiveness.
2. **Strict Idempotency**: Resilient handling of duplicate payloads across multiple pull cycles.
3. **Locking & Non-Overlapping Sync**: Guaranteeing that only one sync pipeline runs at any given moment.
4. **Low-Latency Client Broadcasts**: Pushing newly ingested records to browser clients via Server-Sent Events (SSE) within milliseconds of database persistence.

---

## Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       Browser Client                        │
│                React 18 + Vite (Port 5173)                  │
│                                                             │
│   ┌───────────────────────────┐ ┌───────────────────────┐   │
│   │    Trades Table & State   │ │ SSE EventSource (Live)│   │
│   └─────────────▲─────────────┘ └───────────▲───────────┘   │
└─────────────────┼───────────────────────────┼───────────────┘
                  │ GET /api/trades           │ SSE Stream
                  │ POST /api/pull/start      │ /api/events
┌─────────────────┼───────────────────────────┼───────────────┐
│                 ▼                           ▼               │
│                     Express API Server                      │
│                  Node.js (Port 5000)                        │
│                                                             │
│   ┌────────────────────────┐    ┌───────────────────────┐   │
│   │   pullService.js       │    │    eventService.js    │   │
│   │   - Concurrency Lock   │───►│    - Client registry  │   │
│   │   - Batch Pagination   │    │    - SSE broadcaster  │   │
│   │   - Duplication filter │    └───────────────────────┘   │
│   └───────────┬────────────┘                                │
└───────────────┼─────────────────────────────────────────────┘
                │ Bulk Write (ordered: false)
                ▼
      ┌──────────────────┐               GET /trades?offset=N
      │  MongoDB Cluster │          ┌──────────────────────────┐
      │  (tradeId unique)│          │      Mock BSE Server     │
      └──────────────────┘          │    Express (Port 5001)   │
                                    └──────────────────────────┘
```

---

## Ingestion Pipeline Details

### 1. Concurrency Control
- In `backend/src/services/pullService.js`, an in-memory lock variable `isPulling` acts as a binary semaphore.
- When `POST /api/pull/start` is received:
  - If `isPulling === true`, the API immediately responds with `409 Conflict`.
  - If `isPulling === false`, the flag is set to `true`, a `202 Accepted` response is returned immediately to unblock the client, and the ingestion loop executes asynchronously.
  - A `finally` block ensures `isPulling` is guaranteed to reset to `false` even if an unhandled network or database error occurs.

### 2. Chunked Pagination Loop
- The ingestion process polls `http://localhost:5001/trades` with `limit=500` starting at `offset=0`.
- The offset advances in increments of 500 until the remote endpoint returns an empty array or fewer items than the chunk size.

### 3. Duplicate Prevention & Batch Insertion
- MongoDB schema enforces a unique index on `tradeId`.
- Ingestion uses `Trade.insertMany(batch, { ordered: false })`:
  - Existing trades fail with code `11000` (duplicate key error) without halting the insertion of new records within the same batch.
  - Only newly inserted documents are passed to `eventService.broadcast(trade)`.

### 4. Real-Time Streaming via Server-Sent Events (SSE)
- When clients connect to `GET /api/events`:
  - Response headers are set to `Content-Type: text/event-stream`, `Cache-Control: no-cache`, and `Connection: keep-alive`.
  - The client response socket is stored in an active client Set.
  - Heartbeats or disconnects are handled cleanly on socket close (`req.on("close")`), eliminating resource leaks.
- When a new trade arrives, it is formatted as:
  ```text
  data: {"tradeId":"TRD05001","client":"Alpha Capital","symbol":"RELIANCE",...}\n\n
  ```
  and written to all active client streams.

---

## Frontend State & Rendering Model

- **Initial Hydration**: Loads the most recent 100 trades via `GET /api/trades`.
- **Stream Integration**: Uses browser-native `EventSource`. Incoming trades are prepended to state (`[newTrade, ...currentTrades]`) with client-side deduplication.
- **Visual Feedback**:
  - Live connection status badge (Connected / Disconnected).
  - Stat summary counters (Total loaded trades, latest price, volume).
  - Highlighting pulse/flash effect for incoming trades that dissipates gracefully using CSS keyframe animations.
