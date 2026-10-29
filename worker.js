// Cloudflare Worker: relays site activity to Discord.
// The webhook URL is a SECRET stored in Cloudflare (env.DISCORD_WEBHOOK).
// It is never sent to the browser, so it can't show up in the Network tab.

const hits = new Map(); // tiny per-isolate rate limiter (add a Cloudflare Rate Limiting rule for real protection)

const clip = (v, n = 200) => String(v ?? '').replace(/[`@]/g, '').slice(0, n);

function parseUA(ua = '') {
  const os =
    /Windows NT 10/.test(ua) ? 'Windows' :
    /Windows/.test(ua) ? 'Windows' :
    /iPhone|iPad|iPod/.test(ua) ? 'iOS' :
    /Android/.test(ua) ? 'Android' :
    /Mac OS X/.test(ua) ? 'macOS' :
    /CrOS/.test(ua) ? 'ChromeOS' :
    /Linux/.test(ua) ? 'Linux' : 'Unknown';
  const browser =
    /Edg\//.test(ua) ? 'Edge' :
    /OPR\/|Opera/.test(ua) ? 'Opera' :
    /SamsungBrowser/.test(ua) ? 'Samsung Internet' :
    /Firefox\//.test(ua) ? 'Firefox' :
    /Chrome\//.test(ua) ? 'Chrome' :
    /Safari\//.test(ua) ? 'Safari' : 'Unknown';
  const device =
    /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)) ? 'Tablet' :
    /Mobi|iPhone|Android/.test(ua) ? 'Mobile' : 'Desktop';
  return { os, browser, device };
}

const flag = (cc) =>
  /^[A-Z]{2}$/.test(cc || '') ? String.fromCodePoint(...[...cc].map((c) => 127397 + c.charCodeAt(0))) : '🌐';

async function shortHash(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].slice(0, 4).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const TITLES = {
  page_view: '👁️ New visit',
  intro_finished: '🎬 Watched the intro',
  intro_skipped: '⏭️ Skipped the intro',
  button_click: '🖱️ Clicked the button',
  left_site: '👋 Left the site',
};

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const cors = {
      'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0] || '',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      Vary: 'Origin',
    };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return new Response('Not found', { status: 404 });
    if (!allowed.includes(origin)) return new Response('Forbidden', { status: 403 });
    if (!env.DISCORD_WEBHOOK) return new Response('Not configured', { status: 500, headers: cors });

    let p;
    try { p = JSON.parse(await request.text()); } catch { return new Response('Bad request', { status: 400, headers: cors }); }
    if (!p || typeof p !== 'object' || !TITLES[p.event]) return new Response('Bad request', { status: 400, headers: cors });

    const ip = request.headers.get('CF-Connecting-IP') || '';
    const visitor = await shortHash(ip + (env.HASH_SALT || 'change-me'));

    // rate limit: 40 events / minute / visitor
    const now = Date.now();
    const arr = (hits.get(visitor) || []).filter((t) => now - t < 60000);
    if (arr.length >= 40) return new Response(null, { status: 204, headers: cors });
    arr.push(now); hits.set(visitor, arr);
    if (hits.size > 5000) hits.clear();

    const cf = request.cf || {};
    const ua = parseUA(request.headers.get('User-Agent') || '');
    let country = cf.country || '??';
    try { country = new Intl.DisplayNames(['en'], { type: 'region' }).of(cf.country) || country; } catch {}
    const where = [cf.city, cf.region, country].filter(Boolean).join(', ');

    const fields = [
      { name: 'Location', value: `${flag(cf.country)} ${clip(where)}`, inline: true },
      { name: 'Device', value: `${ua.device} · ${ua.os}`, inline: true },
      { name: 'Browser', value: ua.browser, inline: true },
      { name: 'Screen', value: `${clip(p.scr, 20)} (vp ${clip(p.vp, 20)}, ${clip(p.dpr, 5)}x)`, inline: true },
      { name: 'Language / TZ', value: `${clip(p.lang, 20)} · ${clip(p.tz, 40)}`, inline: true },
      { name: 'Network', value: `${clip(cf.asOrganization || 'unknown', 60)}${p.net ? ' · ' + clip(p.net, 10) : ''}`, inline: true },
      { name: 'Referrer', value: clip(p.ref) || 'direct', inline: false },
      { name: 'Visitor / session', value: `\`${visitor}\` / \`${clip(p.sid, 13)}\``, inline: true },
      { name: 'Time on site', value: `${Math.max(0, Number(p.secs) || 0)}s`, inline: true },
    ];
    if (p.event === 'button_click') fields.unshift({ name: 'Went to', value: clip(p.target, 300), inline: false });
    if (String(env.LOG_IP).toLowerCase() === 'true') fields.push({ name: 'IP', value: `\`${clip(ip, 60)}\``, inline: true });

    const payload = {
      username: 'Site Activity',
      allowed_mentions: { parse: [] },
      embeds: [{
        title: TITLES[p.event],
        description: clip(p.path, 100) || '/',
        color: p.event === 'button_click' ? 0xf2f2f2 : 0x555555,
        fields,
        timestamp: new Date().toISOString(),
      }],
    };

    ctx.waitUntil(
      fetch(env.DISCORD_WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => {})
    );
    return new Response(null, { status: 204, headers: cors });
  },
};
