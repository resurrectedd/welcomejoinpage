SITE ACTIVITY -> DISCORD (hidden webhook)

How it stays hidden
  Browser -> your Worker URL -> Discord.
  The Discord webhook is stored as a Cloudflare secret. It is not in index.html and
  never appears in the browser's Network tab (only your Worker URL does).

Setup (about 5 minutes, free Cloudflare plan is enough)
  1. Discord: Server Settings > Integrations > Webhooks > New Webhook > Copy URL.
  2. Install tools:   npm i -g wrangler      then      wrangler login
  3. In this folder:  edit wrangler.toml and set ALLOWED_ORIGINS to your real site URL.
  4. Store secrets (paste when asked, they are never shown again):
        wrangler secret put DISCORD_WEBHOOK
        wrangler secret put HASH_SALT        (any random string)
  5. Deploy:          wrangler deploy
     It prints a URL like https://site-activity.YOURNAME.workers.dev
  6. In ../index.html set:
        const TRACK_ENDPOINT='https://site-activity.YOURNAME.workers.dev';
        const LINK_URL='https://where-the-button-goes';

What gets posted to Discord
  visit, intro watched/skipped, button click, left site (with time on site).
  Country/city/region and network come from Cloudflare. Device, OS, browser, screen,
  language, timezone and referrer come from the visitor's browser.
  Visitors are shown as an anonymous short hash (same person = same code), NOT their IP,
  unless you set LOG_IP = "true".

Be aware
  - You can't learn WHO someone is, only anonymous details. Country/city are approximate.
  - Tracking visitors can require a privacy notice / consent depending on where they live (GDPR etc.).
    index.html skips visitors with "Do Not Track" on (RESPECT_DNT).
  - Anyone can still see your Worker URL and could send fake events to it. The Worker only accepts
    your site's origin, rate-limits per visitor, and never reveals the webhook, but for heavy
    abuse add a Cloudflare Rate Limiting rule on the Worker.
  - If a webhook URL ever leaks, delete it in Discord and make a new one.
