const express = require("express");
const pullTrades = require("../services/pullService");
const { sendPullStatusEvent } = require("../services/eventService");
const {
  isPullInProgress,
  setPullInProgress,
} = require("../services/pullStatusService");

const router = express.Router();

// Start a trade pull
router.post("/pull/start", (req, res) => {
  if (isPullInProgress()) {
    return res.status(409).json({
      message: "A trade pull is already in progress",
    });
  }

  setPullInProgress(true);
  sendPullStatusEvent(true);

  // Respond immediately — pull runs in background
  res.status(202).json({
    message: "Trade pull started",
  });

  console.log("ABOUT TO CALL pullTrades()");

  // Run the pull in the background
  pullTrades()
    .then(() => {
      console.log("pullTrades() FINISHED");

      setPullInProgress(false);
      sendPullStatusEvent(false);
    })
    .catch((error) => {
      console.error("Trade pull failed:", error.message);

      setPullInProgress(false);
      sendPullStatusEvent(false);
    });
});

// Get current pull status
router.get("/pull/status", (req, res) => {
  res.json({
    inProgress: isPullInProgress(),
  });
});

module.exports = router;