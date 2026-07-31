# Reminder bot — WhatsApp/Telegram przypomnienia za darmo

Bot działa w 100% za darmo na GitHub Actions (scheduler) + Telegram (wysyłka).
Zero serwera, zero VPS, zero laptopa włączonego 24/7.

## Jak to działa

1. `reminders.json` przechowuje Twoje przypomnienia (data, tytuł, ile dni wcześniej przypomnieć, czy cykliczne).
2. `.github/workflows/daily-check.yml` uruchamia codziennie o ustalonej porze `check.js`.
3. `check.js` sprawdza, czy dziś jest dzień, w którym trzeba wysłać przypomnienie, i jeśli tak — wysyła wiadomość na Telegram, a wynik (np. `last_sent`, przesunięta data dla cyklicznych) commituje z powrotem do repo.
4. `index.html` to panel w przeglądarce do dodawania/edycji/usuwania przypomnień — hostowany za darmo na GitHub Pages, zapisuje zmiany bezpośrednio do `reminders.json` w repo przez GitHub API.

## Krok 1 — Załóż bota na Telegramie (2 minuty)

1. W Telegramie znajdź **@BotFather**, wyślij `/newbot`, nadaj nazwę.
2. Dostaniesz **token** (wygląda jak `123456789:AAExxxxxxx...`) — zapisz go.
3. Napisz cokolwiek do swojego nowego bota (musisz "odblokować" możliwość wysyłania do Ciebie).
4. Wejdź w przeglądarce na:
   `https://api.telegram.org/bot<TWÓJ_TOKEN>/getUpdates`
   i znajdź swoje `chat.id` (liczba, np. `987654321`) — to jest **TELEGRAM_CHAT_ID**.

## Krok 2 — Wrzuć ten projekt na GitHub

```bash
cd reminder-bot
git init
git add .
git commit -m "init"
git branch -M main
git remote add origin https://github.com/<TWOJ_LOGIN>/reminder-bot.git
git push -u origin main
```

(Repo może być prywatne — działa tak samo.)

## Krok 3 — Dodaj sekrety w GitHub

W repo: **Settings → Secrets and variables → Actions → New repository secret**

- `TELEGRAM_BOT_TOKEN` = token z BotFather
- `TELEGRAM_CHAT_ID` = Twoje chat id

## Krok 4 — Włącz GitHub Pages (panel do zarządzania)

**Settings → Pages → Source: Deploy from branch → branch `main`, folder `/ (root)`**

Po chwili panel będzie dostępny pod:
`https://<TWOJ_LOGIN>.github.io/reminder-bot/`

## Krok 5 — Wygeneruj token do panelu (żeby mógł zapisywać zmiany)

1. GitHub → **Settings (konta, nie repo) → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**
2. Uprawnienia: dostęp tylko do repo `reminder-bot`, **Contents: Read and write**
3. Skopiuj token (widoczny tylko raz!)
4. Wejdź na panel (link z kroku 4), rozwiń "Ustawienia połączenia z repozytorium", wklej:
   - `owner/repo`, np. `filip123/reminder-bot`
   - wygenerowany token
5. Kliknij "Zapisz w tej przeglądarce" — token trzyma się tylko lokalnie w Twojej przeglądarce (localStorage), nigdy nie trafia nigdzie indziej poza bezpośrednim zapytaniem do GitHub API.

## Krok 6 — Dodaj pierwsze przypomnienie i przetestuj

1. W panelu kliknij **+ Dodaj**, wpisz dane (np. polisa, data, "przypomnij 30 dni wcześniej").
2. Żeby przetestować wysyłkę bez czekania do jutra: w repo na GitHub wejdź w zakładkę **Actions → Daily Reminder Check → Run workflow** (przycisk ręcznego odpalenia, dodany w workflow jako `workflow_dispatch`).
3. Jeśli data przypomnienia wypada dziś lub wcześniej — dostaniesz wiadomość na Telegramie.

## Uwaga o strefie czasowej

GitHub Actions crony działają w UTC. Workflow jest ustawiony na `7:00 UTC`, czyli ok. **8:00–9:00 czasu polskiego** (zależnie od czasu letniego/zimowego). Jeśli chcesz inną porę, zmień linię `cron: "0 7 * * *"` w `.github/workflows/daily-check.yml` (format: minuta godzina dzień miesiąc dzień-tygodnia, czas UTC).

## Co możesz łatwo rozbudować później

- Dodać e-mail jako drugi kanał (nodemailer + sekret SMTP) — te same "widełki" co Telegram.
- Dodać kategorię/priorytet z innym formatowaniem wiadomości.
- Przenieść na Oracle Cloud Free Tier, jeśli kiedyś zechcesz WhatsApp zamiast Telegrama (whatsapp-web.js wymaga stale działającego procesu, czego GitHub Actions nie zapewnia).
