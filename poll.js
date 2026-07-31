// poll.js
// Uruchamiany cyklicznie (co kilka minut) przez osobny workflow.
// Sprawdza nowe wiadomości/kliknięcia na Telegramie od ostatniego uruchomienia
// (offset trzymany w bot_state.json), obsługuje komendy /lista, /pomoc oraz
// kliknięcia przycisków pod wiadomościami z przypomnieniami.

const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "reminders.json");
const STATE_PATH = path.join(__dirname, "bot_state.json");

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error("Brakuje TELEGRAM_BOT_TOKEN lub TELEGRAM_CHAT_ID w zmiennych środowiskowych.");
  process.exit(1);
}

const API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function loadState() {
  if (!fs.existsSync(STATE_PATH)) return { last_update_id: 0 };
  return JSON.parse(fs.readFileSync(STATE_PATH, "utf-8"));
}

function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + "\n");
}

function loadReminders() {
  return JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));
}

function saveReminders(reminders) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(reminders, null, 2) + "\n");
}

async function sendMessage(text) {
  await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: "HTML" }),
  });
}

async function answerCallback(callbackQueryId, text) {
  await fetch(`${API}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text, show_alert: false }),
  });
}

async function editMessageMarkup(chatId, messageId, text) {
  // Usuwa przyciski i dopisuje info, że akcja została obsłużona
  await fetch(`${API}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
    }),
  });
}

function daysUntil(dateStr) {
  const today = new Date(todayISO() + "T00:00:00Z");
  const d = new Date(dateStr + "T00:00:00Z");
  return Math.round((d - today) / 86400000);
}

async function handleListCommand() {
  const reminders = loadReminders().filter((r) => r.active);
  if (!reminders.length) {
    await sendMessage("Brak aktywnych przypomnień.");
    return;
  }
  const sorted = reminders.sort((a, b) => new Date(a.target_date) - new Date(b.target_date));
  const lines = sorted.map((r) => {
    const d = daysUntil(r.target_date);
    return `• <b>${escapeHtml(r.title)}</b> — ${r.target_date} (za ${d} dni)`;
  });
  await sendMessage(`📋 <b>Aktywne przypomnienia:</b>\n\n${lines.join("\n")}`);
}

async function handleHelpCommand() {
  const res = await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      parse_mode: "HTML",
      text:
        "🤖 <b>Jak działa ten bot</b>\n\n" +
        "/lista — pokazuje wszystkie aktywne przypomnienia\n" +
        "/pomoc — ta wiadomość (przypięta na górze czatu)\n\n" +
        "Pod każdym przypomnieniem, które przyjdzie automatycznie, są przyciski:\n" +
        "✅ Opłacono / Zrobione — wyłącza przypomnienie\n" +
        "⏰ Za 7 / 30 dni — odkłada przypomnienie o tyle dni",
    }),
  });
  const data = await res.json();
  if (data.ok && data.result && data.result.message_id) {
    // Przypnij tę wiadomość na górze czatu, żeby zawsze była pod ręką
    await fetch(`${API}/pinChatMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        message_id: data.result.message_id,
        disable_notification: true,
      }),
    });
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

async function handleCallback(update) {
  const cq = update.callback_query;
  const data = cq.data || "";
  const [action, id] = data.split(":");
  const reminders = loadReminders();
  const r = reminders.find((x) => x.id === id);

  if (!r) {
    await answerCallback(cq.id, "Nie znaleziono przypomnienia (mogło zostać usunięte).");
    return;
  }

  if (action === "done") {
    r.active = false;
    await answerCallback(cq.id, "Oznaczono jako zrobione ✅");
    await editMessageMarkup(cq.message.chat.id, cq.message.message_id, `${cq.message.text}\n\n✅ <i>Opłacono / zrobione</i>`);
  } else if (action === "snooze7" || action === "snooze30") {
    const days = action === "snooze7" ? 7 : 30;
    const until = addDays(todayISO(), days);
    r.snoozed_until = until;
    r.muted_until = until; // wycisz normalny trigger do tego dnia
    await answerCallback(cq.id, `Przypomnę ponownie ${until}`);
    await editMessageMarkup(
      cq.message.chat.id,
      cq.message.message_id,
      `${cq.message.text}\n\n⏰ <i>Odłożone do ${until}</i>`
    );
  } else {
    await answerCallback(cq.id, "Nieznana akcja.");
    return;
  }

  saveReminders(reminders);
}

async function handleTextMessage(update) {
  const text = (update.message.text || "").trim();
  if (text === "/lista") await handleListCommand();
  else if (text === "/pomoc" || text === "/start") await handleHelpCommand();
}

async function main() {
  const state = loadState();
  const res = await fetch(`${API}/getUpdates?offset=${state.last_update_id + 1}&timeout=0`);
  if (!res.ok) {
    console.error("Błąd getUpdates:", await res.text());
    process.exit(1);
  }
  const data = await res.json();
  const updates = data.result || [];

  if (!updates.length) {
    console.log("Brak nowych wiadomości.");
    return;
  }

  for (const update of updates) {
    // Reagujemy tylko na wiadomości z Twojego czatu (bezpieczeństwo)
    const fromChatId = update.callback_query
      ? String(update.callback_query.message.chat.id)
      : update.message
      ? String(update.message.chat.id)
      : null;

    if (fromChatId !== String(TELEGRAM_CHAT_ID)) {
      console.log("Ignoruję wiadomość z innego czatu.");
      continue;
    }

    if (update.callback_query) {
      await handleCallback(update);
    } else if (update.message && update.message.text) {
      await handleTextMessage(update);
    }
    state.last_update_id = update.update_id;
  }

  saveState(state);
  console.log(`Przetworzono ${updates.length} aktualizacji.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
