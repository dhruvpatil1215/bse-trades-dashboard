const express = require("express");
const cors = require("cors");
require("dotenv").config();

const connectDatabase = require("./config/database");
const tradeRoutes = require("./routes/tradeRoutes");
const pullRoutes = require("./routes/pullRoutes");
const eventRoutes = require("./routes/eventRoutes");

const app = express();

const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use("/api", tradeRoutes);
app.use("/api", pullRoutes);
app.use("/api", eventRoutes);

app.get("/", (req, res) => {
  res.json({
    message: "BSE Trades Backend is running",
  });
});

connectDatabase();

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});