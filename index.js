const express = require("express");
const app = express();

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
const lastNotifications = new Map();

const PRICE_CHANGE_THRESHOLD = 10;

function connectCoinbase() {
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

      if (trade.type === "ticker" && trade.price) {
        previousPrice = btcPrice;
        btcPrice = parseFloat(trade.price);
      }
    } catch (err) {
      console.error(err);
    }
  });

  ws.on("close", () => {
    console.log("Coinbase disconnected. Reconnecting...");

    setTimeout(connectCoinbase, 3000);
  });

  ws.on("error", (err) => {
    console.log("WebSocket error:", err.message);
  });
}

connectCoinbase();

function getDirection() {
  if (previousPrice === null || btcPrice === null) {
    return "⏺";
  }

  if (btcPrice > previousPrice) {
    return "🟢 ▲";
  }

  if (btcPrice < previousPrice) {
    return "🔴 ▼";
  }

  return "⚪";
}

function shouldNotify() {
  if (previousPrice === null || btcPrice === null) {
    return false;
  }

  const difference = Math.abs(btcPrice - previousPrice);

  return difference >= PRICE_CHANGE_THRESHOLD;
}

function generateNotification() {
  const direction = getDirection();

  return `₿ BTC $${btcPrice.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${direction}`;
}

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  activeChats.set(chatId, true);

  bot.sendMessage(
    chatId,
    `
✅ BTC Live Tracker Started

You will receive lock-screen updates.

Commands:
/stop → Stop tracker
/price → Current BTC price
`.trim(),
  );
});

bot.onText(/\/price/, (msg) => {
  if (!btcPrice) {
    return bot.sendMessage(msg.chat.id, "Fetching BTC price...");
  }

  bot.sendMessage(msg.chat.id, generateNotification());
});

bot.onText(/\/stop/, (msg) => {
  activeChats.delete(msg.chat.id);

  bot.sendMessage(msg.chat.id, "⛔ BTC tracker stopped");
});

setInterval(async () => {
  if (!shouldNotify()) return;

  for (const [chatId] of activeChats) {
    try {
      const sent = await bot.sendMessage(chatId, generateNotification(), {
        disable_notification: false,
      });

      const oldMessageId = lastNotifications.get(chatId);

      if (oldMessageId) {
        try {
          await bot.deleteMessage(chatId, oldMessageId);
        } catch {}
      }

      lastNotifications.set(chatId, sent.message_id);
    } catch (err) {
      console.log("Telegram error:", err.message);
    }
  }
}, 5000);

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("BTC Bot Running 🚀");
});

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});