const Trade = require("../models/Trade");
const { sendTradeEvent } = require("./eventService");

const BSE_API_URL =
  process.env.BSE_API_URL || "http://localhost:5001/getTrades";

const BATCH_SIZE = 500;

const pullTrades = async () => {
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    console.log(`Fetching trades: offset=${offset}, limit=${BATCH_SIZE}`);

    const response = await fetch(
      `${BSE_API_URL}?offset=${offset}&limit=${BATCH_SIZE}`
    );

    if (!response.ok) {
      throw new Error(`BSE API returned ${response.status}`);
    }

    const data = await response.json();

    const trades = data.trades || [];

    if (trades.length === 0) {
      console.log("No more trades received from BSE API");
      break;
    }

    let newCount = 0;
    let dupCount = 0;

    for (const trade of trades) {
      try {
        const insertedTrade = await Trade.create(trade);

        newCount++;
        sendTradeEvent(insertedTrade);
      } catch (error) {
        if (error.code === 11000) {
          // Duplicate tradeId — skip silently
          dupCount++;
          continue;
        }

        throw error;
      }
    }

    console.log(
      `Batch done: ${newCount} new, ${dupCount} duplicates skipped`
    );

    hasMore = data.pagination?.hasMore === true;

    offset += BATCH_SIZE;
  }

  console.log("Trade pull completed");
};

module.exports = pullTrades;