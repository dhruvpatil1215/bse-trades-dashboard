const express = require("express");
const Trade = require("../models/Trade");

const router = express.Router();

router.get("/trades", async (req, res) => {
  try {
    const trades = await Trade.find()
      .sort({ timestamp: -1 })
      .limit(100);

    res.json({
      trades,
    });
  } catch (error) {
    console.error("Failed to fetch trades:", error.message);

    res.status(500).json({
      message: "Failed to fetch trades",
    });
  }
});

module.exports = router;