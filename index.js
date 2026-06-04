require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const WebSocket = require("ws");

const token = process.env.BOT_TOKEN;

const bot = new TelegramBot(token, {
  polling: true,
});

let btcPrice = null;
let previousPrice = null;

const activeChats = new Map();

function connectBinance() {
  const ws = new WebSocket("wss://ws-feed.exchange.coinbase.com");

  ws.on("open", () => {
    console.log("Connected to Coinbase");

    ws.send(
      JSON.stringify({
        type: "subscribe",
        channels: [
          {
            name: "ticker",
            product_ids: ["BTC-USD"],
          },
        ],
      }),
    );
  });

  ws.on("message", (data) => {
    try {
      const trade = JSON.parse(data);

      if (trade.type === "ticker") {
        previousPrice = btcPrice;
        btcPrice = parseFloat(trade.price).toFixed(2);
      }
    } catch (err) {
      console.error(err);
    }
  });

  ws.on("close", () => {
    console.log("Reconnecting...");
    setTimeout(connectBinance, 3000);
  });

  ws.on("error", (err) => {
    console.error("WebSocket error", err);
    ws.close();
  });
}

connectBinance();

function getDirection() {
  if (!previousPrice || !btcPrice) return "⏺";

  return btcPrice > previousPrice ? "🟢 ▲" : btcPrice < previousPrice ? "🔴 ▼" : "⚪";
}

function generateMessage() {
  const direction = getDirection();

  return `
₿ <b>BTC / USDT</b>

💰 <b>$${btcPrice}</b>

${direction}

⏱ Updated: ${new Date().toLocaleTimeString()}
`.trim();
}

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  const sent = await bot.sendMessage(chatId, "Starting BTC Live Tracker...", {
    parse_mode: "HTML",
  });

  activeChats.set(chatId, sent.message_id);

  bot.sendMessage(
    chatId,
    `
✅ Live BTC tracker started

Pin this message for quick access.

Commands:
/stop - Stop tracker
/price - Current price
`.trim(),
  );
});

bot.onText(/\/price/, (msg) => {
  bot.sendMessage(msg.chat.id, generateMessage(), {
    parse_mode: "HTML",
  });
});

bot.onText(/\/stop/, (msg) => {
  activeChats.delete(msg.chat.id);

  bot.sendMessage(msg.chat.id, "⛔ BTC tracker stopped");
});

let lastNotifications = new Map();

setInterval(async () => {
  for (const [chatId] of activeChats.entries()) {
    try {
      const direction = getDirection();

      const text = `₿ BTC/USDT
$${btcPrice}
${direction}`;

      const sent = await bot.sendMessage(chatId, text, {
        disable_notification: false,
      });

      const oldMessageId = lastNotifications.get(chatId);

      if (oldMessageId) {
        try {
          await bot.deleteMessage(chatId, oldMessageId);
        } catch (e) {}
      }

      lastNotifications.set(chatId, sent.message_id);
    } catch (err) {
      console.log(err.message);
    }
  }
}, 5000);
