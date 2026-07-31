// check.js
// Odczytuje reminders.json, sprawdza które przypomnienia są dziś "do wysłania"
// (target_date - remind_days_before === dzisiaj), wysyła wiadomość na Telegram,
// zapisuje last_sent i (jeśli repeat_interval ustawiony) przesuwa datę na kolejny cykl.

const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "reminders.json");

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error("Brakuje TELEGRAM_BOT_TOKEN lub TELEGRAM_CHAT_ID w zmiennych środowiskowych.");
  process.exit(1);
}

function todayISO() {
  // Data w formacie YYYY-MM-DD, wg czasu UTC (GitHub Actions runnery działają w UTC)
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function subtractDays(dateStr, days) {
  return addDays(dateStr, -days);
}

function advanceDate(dateStr, interval) {
  const d = new Date(dateStr + "T00:00:00Z");
  if (interval === "yearly") d.setUTCFullYear(d.getUTCFullYear() + 1);
  else if (interval === "monthly") d.setUTCMonth(d.getUTCMonth() + 1);
  else if (interval === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
}

async function sendTelegramMessage(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: "HTML",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram API error: ${res.status} ${body}`);
  }
  return res.json();
}

async function main() {
  const raw = fs.readFileSync(DATA_PATH, "utf-8");
  const reminders = JSON.parse(raw);
  const today = todayISO();
  let changed = false;

  for (const r of reminders) {
    if (!r.active) continue;

    const remindDate = subtractDays(r.target_date, r.remind_days_before);

    // Wyślij, jeśli dziś jest dzień przypomnienia i jeszcze dziś nie wysłano
    if (remindDate <= today && r.last_sent !== today && r.target_date >= today) {
      // remindDate <= today (a nie tylko ===) na wypadek, gdyby workflow nie
      // uruchomił się dokładnie w dniu przypomnienia (np. przerwa w GitHub Actions)
      const daysLeft = Math.round(
        (new Date(r.target_date) - new Date(today)) / (1000 * 60 * 60 * 24)
      );
      const text =
        `🔔 <b>Przypomnienie</b>\n\n` +
        `${r.title}\n` +
        (r.category ? `Kategoria: ${r.category}\n` : "") +
        `Data: ${r.target_date} (za ${daysLeft} dni)`;

      console.log(`Wysyłam: ${r.title}`);
      await sendTelegramMessage(text);
      r.last_sent = today;
      changed = true;
    }

    // Jeśli termin minął i przypomnienie jest cykliczne — przesuń na kolejny cykl
    if (r.repeat_interval && r.target_date < today) {
      const newDate = advanceDate(r.target_date, r.repeat_interval);
      console.log(`Przesuwam cykliczne przypomnienie "${r.title}": ${r.target_date} -> ${newDate}`);
      r.target_date = newDate;
      r.last_sent = null;
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(DATA_PATH, JSON.stringify(reminders, null, 2) + "\n");
    console.log("Zapisano zmiany w reminders.json");
  } else {
    console.log("Brak przypomnień do wysłania dzisiaj.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
