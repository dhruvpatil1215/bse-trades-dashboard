# BSE Trades Dashboard

A real-time trading dashboard and robust ingestion pipeline for Bombay Stock Exchange (BSE) equity trades. Features high-throughput batch synchronization, idempotent duplicate prevention, concurrency locks, and live real-time streaming via Server-Sent Events (SSE).

---

## 🚀 Key Features

- **Initial Load & Pagination**: Efficiently loads the latest 100 trades from MongoDB with indexed sorting by timestamp.
- **Batch Ingestion Pipeline**: Pulls trades from the Mock BSE API in 500-record chunks (`offset=0, 500, 1000... 4500`), traversing up to 5,000+ records safely.
- **Concurrency Locking**: Prevents race conditions with atomic lock state (`isPulling`). Concurrent pull requests return `409 Conflict`.
- **Idempotency & Duplicate Prevention**: Uses MongoDB compound index (`tradeId: 1`, unique) with `ordered: false` batch inserts. Duplicates are gracefully skipped (`E11000` handled) without aborting batch processing.
- **Real-Time Streaming via SSE**: Server-Sent Events stream newly inserted trades instantly to connected browser clients without requiring polling or websockets.
- **Premium UI Dashboard**: Built with React and modern CSS tokens (Inter font, dark mode, stat cards, animated highlight flashes for live incoming trades, SSE connection status indicator, and skeleton loaders).

---

## 🛠 Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 18, Vite, Native EventSource (SSE), Pure CSS Design System |
| **Backend** | Node.js, Express 4, Mongoose 8, Native SSE |
| **Database** | MongoDB / MongoDB Atlas (Unique Index on `tradeId`) |
| **Mock Provider** | Express.js Mock BSE Trade Generation Engine (Port 5001) |

---

## 🏗 Architecture & Data Flow

```text
  [ Mock BSE API ] (Port 5001)
         ▲
         │ (HTTP GET /trades?limit=500&offset=N)
         ▼
  [ Backend Pull Service ] (Port 5000)
         │
         ├─► Checks isPulling concurrency lock (returns 409 if active)
         ├─► Inserts new trades into MongoDB (ordered: false, skips duplicates)
         └─► Emits newly created trades to SSE clients
                    │
                    ▼
     [ Browser Frontend ] (Port 5173)
         ├─► Initial trades: GET /api/trades (latest 100)
         ├─► SSE Stream: GET /api/events (live trade notifications)
         └─► Manual sync trigger: POST /api/pull/start
```

---

## 🐛 Key Bugs Identified & Fixed

During codebase inspection and hardening, several critical bugs were resolved:

1. **`pullRoutes.js` Route Mounting Bug**:
   - *Issue*: `pullRoutes.js` exported a raw controller function instead of an Express Router instance. When mounted via `app.use("/api", pullRoutes)`, it ran on **every** HTTP request, causing unintentional sync triggers starting at `offset=0`.
   - *Fix*: Refactored `pullRoutes.js` to define standard Express Router routes (`POST /pull/start`).

2. **Concurrency Race Conditions**:
   - *Issue*: Multiple overlapping syncs could run concurrently, overloading database connections and creating redundant API round-trips.
   - *Fix*: Added an atomic in-memory lock `isPulling` that immediately rejects concurrent requests with `409 Conflict` until the pipeline finishes.

3. **Batch Insertion & Duplicate Handling**:
   - *Issue*: Single duplicate trades caused standard `insertMany` batches to fail completely.
   - *Fix*: Configured `Trade.insertMany(newTrades, { ordered: false })` combined with catching `11000` error codes. Only genuinely new records trigger SSE broadcasts.

4. **SSE Event Stream Cleanup**:
   - *Issue*: Disconnected client listeners accumulated, leading to memory leaks and failed write attempts.
   - *Fix*: Handled `req.on("close")` on `/api/events` to cleanly deregister clients from the broadcast set.

---

## ⚙️ Getting Started

### 1. Prerequisites
- Node.js (v18 or higher recommended)
- MongoDB instance (local or MongoDB Atlas connection string)

### 2. Environment Configuration
Create a `.env` file in the `backend/` directory:
```env
PORT=5000
MONGODB_URI=your_mongodb_connection_string
```

### 3. Running Services

Open three terminal sessions or background processes:

**Terminal 1 — Mock BSE Service (Port 5001):**
```bash
cd mock-bse
npm install
npm start
```

**Terminal 2 — Backend API (Port 5000):**
```bash
cd backend
npm install
npm start
```

**Terminal 3 — Frontend Dashboard (Port 5173):**
```bash
cd frontend
npm install
npm run dev
```

Visit **http://localhost:5173** to view the live dashboard.

---

## 📡 API Reference

### Backend Endpoints (`http://localhost:5000`)
- `GET /api/trades` — Returns latest 100 trades sorted descending by timestamp.
- `GET /api/events` — SSE stream endpoint for real-time trade event broadcasting.
- `POST /api/pull/start` — Triggers batch synchronization against Mock BSE API (`202 Accepted` on start, `409 Conflict` if running).

### Mock BSE Endpoints (`http://localhost:5001`)
- `GET /trades?limit=500&offset=0` — Fetches paginated batch of BSE trades.
- `POST /addTrade` — Injects a new trade (e.g. `TRD05001`, `TRD05002`) into the mock market feed.
