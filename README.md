# Shuddh Desi Bites on WhatsApp

A WhatsApp ordering bot that runs on Meta's WhatsApp Cloud API. Customers browse
the menu, build a cart and place an order without leaving the chat. Questions
that don't fit a button go to Claude, and anything Claude can't answer is left
for you to reply to from the WhatsApp Business app on your phone.

The menu comes from the **Zomato Menu** Google Sheet that the daily Zomato sync
keeps up to date, so a price change on Zomato reaches WhatsApp the next day.

## How a chat goes

1. The customer says hi and gets three buttons: **Menu**, **My cart**, **Talk to us**.
2. **Menu** opens a list of categories (Best Sellers first), then the dishes in
   that category, then the dish's options (size, add cheese, butter chiplets).
3. They pick a quantity, and the cart total is shown after every addition.
4. **Checkout** asks for the address, as text or a shared location, then shows the
   order for a final **Place order** tap.
5. The customer gets an order number, and you get a message with the order on
   `OWNER_WHATSAPP_NUMBER`. The bot then stays quiet in that chat for two hours
   so you can confirm the delivery time and payment yourself.

Free-text messages ("is the paneer paratha spicy?") go to Claude with the full
menu. Complaints, payment, delivery status, bulk orders and anything off-menu are
handed to you: the bot tells the customer someone will reply and goes quiet in
that chat until they tap **Menu** again.

## What you need

- A Meta developer app with the WhatsApp product, and its **Phone number ID**,
  **App secret** and a **permanent access token** from a System User with
  `whatsapp_business_messaging` and `whatsapp_business_management`.
- A free [Vercel](https://vercel.com) account to host the webhook.
- The menu sheet shared as **Anyone with the link: Viewer**, so the bot can read
  it. It holds only the public menu.
- Optional: an [Anthropic API key](https://console.anthropic.com) for free-text replies.

## Set up

1. Import this repo in Vercel (Add New → Project).
2. In the Vercel project, open **Storage** and add **Upstash Redis**. It fills in
   the Redis variables, which keep each customer's cart between messages.
3. Add the variables from `.env.example` under Settings → Environment Variables,
   then redeploy.
4. In the Meta app dashboard, open WhatsApp → Configuration → Webhook:
   - Callback URL: `https://<your-vercel-domain>/api/webhook`
   - Verify token: the same value as `WHATSAPP_VERIFY_TOKEN`
   - Subscribe to the **messages** field.
5. Send "hi" to the test number from your phone (add your phone as a recipient
   on the API Setup page first).

### Keeping your number on your phone

Don't add your real business number with **Add phone number** on the API Setup
page: that moves the number off the WhatsApp Business app. To keep using the app,
onboard the number with Meta's coexistence flow (Embedded Signup), so chats show
in the app and the API at the same time. Until then, test with Meta's test number.

### The 24-hour rule

The bot replies with free-form messages, which Meta allows only within 24 hours
of the customer's last message. Messages you start yourself, such as offers,
need templates approved in WhatsApp Manager. The new-order alert to
`OWNER_WHATSAPP_NUMBER` follows the same rule, so message the business number
from your own phone once a day, or the alert can fail. The order still shows in
the chat either way.

## Develop

```bash
npm install
npm test
```

Code layout:

- `api/webhook.js`: the Vercel function Meta calls.
- `lib/app.js`: verifies Meta's signature, skips repeated deliveries, and passes
  each message on.
- `lib/bot.js`: the conversation and ordering flow.
- `lib/menu.js`: reads the newest menu version from the sheet.
- `lib/ai.js`: Claude replies to free text.
- `lib/whatsapp.js`: sends text, buttons and lists through the Cloud API.
- `lib/store.js`: per-customer state in Upstash Redis, or in memory locally.
