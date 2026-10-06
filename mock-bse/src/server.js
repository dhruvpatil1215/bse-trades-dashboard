const trades = require("./data/trades");
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5001;

// Home route
app.get("/", (req, res) => {
  res.json({
    message: "Mock BSE API is running",
  });
});

// Get trades with pagination
app.get("/getTrades", (req, res) => {
  const offset = Number(req.query.offset) || 0;
  const limit = Number(req.query.limit) || 500;

  const result = trades.slice(offset, offset + limit);

  res.json({
    trades: result,
    pagination: {
      offset,
      limit,
      total: trades.length,
      hasMore: offset + limit < trades.length,
    },
  });
});

// Create one trade
app.post("/addTrade", (req, res) => {
  const { client, symbol, quantity, price } = req.body || {};

  const symbols = [
    "RELIANCE",
    "TCS",
    "INFY",
    "HDFCBANK",
    "ICICIBANK",
    "SBIN",
    "ITC",
    "WIPRO",
    "AXISBANK",
    "LT",
  ];

  const tradeNumber = trades.length + 1;

  const newTrade = {
    tradeId: `TRD${String(tradeNumber).padStart(5, "0")}`,

    client:
      client ||
      `CLIENT${String((tradeNumber % 100) + 1).padStart(3, "0")}`,

    symbol:
      symbol || symbols[(tradeNumber - 1) % symbols.length],

    quantity:
      Number(quantity) || ((tradeNumber % 100) + 1) * 10,

    price:
      Number(price) ||
      Number(
        (500 + (tradeNumber % 5000) * 0.73).toFixed(2)
      ),

    timestamp: new Date().toISOString(),
  };

  trades.push(newTrade);

  res.status(201).json({
    message: "Trade created successfully",
    trade: newTrade,
  });
});

// Create multiple trades
app.post("/addTrades", (req, res) => {
  const count = Number(req.body?.count) || 20;

  const symbols = [
    "RELIANCE",
    "TCS",
    "INFY",
    "HDFCBANK",
    "ICICIBANK",
    "SBIN",
    "ITC",
    "WIPRO",
    "AXISBANK",
    "LT",
  ];

  const createdTrades = [];

  for (let i = 0; i < count; i++) {
    const tradeNumber = trades.length + 1;

    const newTrade = {
      tradeId: `TRD${String(tradeNumber).padStart(5, "0")}`,

      client:
        `CLIENT${String((tradeNumber % 100) + 1).padStart(3, "0")}`,

      symbol:
        symbols[(tradeNumber - 1) % symbols.length],

      quantity:
        ((tradeNumber % 100) + 1) * 10,

      price:
        Number(
          (500 + (tradeNumber % 5000) * 0.73).toFixed(2)
        ),

      timestamp: new Date().toISOString(),
    };

    trades.push(newTrade);
    createdTrades.push(newTrade);
  }

  res.status(201).json({
    message: `${createdTrades.length} trades created successfully`,
    trades: createdTrades,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Mock BSE API running on http://localhost:${PORT}`);
});