const clients = new Set();

const addClient = (res) => {
  clients.add(res);

  console.log(`SSE client connected. Total clients: ${clients.size}`);

  res.on("close", () => {
    clients.delete(res);

    console.log(
      `SSE client disconnected. Total clients: ${clients.size}`
    );
  });
};

const sendTradeEvent = (trade) => {
  const data = JSON.stringify(trade);

  for (const client of clients) {
    client.write(`data: ${data}\n\n`);
  }
};

const sendPullStatusEvent = (inProgress) => {
  const data = JSON.stringify({
    inProgress,
  });

  for (const client of clients) {
    client.write(`event: pull-status\n`);
    client.write(`data: ${data}\n\n`);
  }
};

module.exports = {
  addClient,
  sendTradeEvent,
  sendPullStatusEvent,
};