import dns from 'node:dns';

dns.setDefaultResultOrder('ipv4first');

const escHtml = v => String(v ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

const icons = {
  fills: '🟢',
  signals: '⚡',
  risk: '🛑',
  connections: '⚠️'
};

export function createTelegram(env = process.env, request = fetch) {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.TELEGRAM_CHAT_ID?.trim();
  const configured = Boolean(token && chatId);
  const api = method => `https://api.telegram.org/bot${token}/${method}`;
  const endpoint = configured ? api('sendMessage') : null;
  const throttle = new Map();
  let polling = false;
  let offset = 0;

  async function post(text) {
    if (!configured) throw Error('Configure TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in the server environment.');
    const chunks = [];
    let remaining = String(text ?? '');
    while (remaining.length > 3900) {
      let cut = remaining.lastIndexOf('\n', 3900);
      if (cut < 1000) cut = 3900;
      chunks.push(remaining.slice(0, cut));
      remaining = remaining.slice(cut).replace(/^\n+/, '');
    }
    if (remaining) chunks.push(remaining);
    for (const chunk of chunks) {
      const res = await request(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: chunk, parse_mode: 'HTML', disable_web_page_preview: true }),
        signal: AbortSignal.timeout(12000)
      });
      if (!res.ok) {
        let detail = '';
        try {
          const body = await res.json();
          if (body?.description) detail = ': ' + body.description;
        } catch {}
        throw Error('Telegram request failed (' + res.status + ')' + detail);
      }
    }
    return true;
  }

  function notify(kind, title, details = []) {
    if (!configured) return Promise.resolve(false);
    if (kind === 'connections') {
      const now = Date.now();
      const key = title.slice(0, 80);
      if (now - (throttle.get(key) ?? 0) < 300000) return Promise.resolve(false);
      throttle.set(key, now);
    }
    const badge = icons[kind] ?? '🔔';
    const lines = [
      `${badge} <b>FastTrader · ${escHtml(kind.toUpperCase())}</b>`,
      `<b>${escHtml(title)}</b>`,
      ...details.filter(Boolean).map(line => escHtml(line))
    ];
    return post(lines.join('\n')).catch(error => {
      console.error('Telegram notify failed:', error.message);
      return false;
    });
  }

  async function sendTest(mode = 'alpaca') {
    const text = [
      '✅ <b>FastTrader Telegram Connected</b>',
      `Workspace mode: <code>${escHtml(mode)}</code>`,
      `Time: ${escHtml(new Date().toISOString())}`,
      'Type /help to see all available commands.'
    ].join('\n');
    await post(text);
    return { sent: true };
  }

  async function registerCommands(commands) {
    if (!configured || !commands?.length) return;
    try {
      await request(api('setMyCommands'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commands }),
        signal: AbortSignal.timeout(10000)
      });
    } catch {}
  }

  function startPolling(onCommand, commands = []) {
    if (!configured || polling) return;
    polling = true;
    const bootSec = Math.floor(Date.now() / 1000) - 60;
    void registerCommands(commands);
    (async () => {
      while (polling) {
        let delayMs = 1500;
        try {
          const url = api('getUpdates') + `?offset=${offset}&timeout=25&allowed_updates=${encodeURIComponent(JSON.stringify(['message']))}`;
          const res = await request(url, { signal: AbortSignal.timeout(35000) });
          if (res.status === 409) {
            delayMs = 30000;
          } else if (res.ok) {
            const data = await res.json();
            for (const update of data?.result ?? []) {
              offset = Math.max(offset, (update.update_id ?? 0) + 1);
              const msg = update.message;
              if (!msg?.text || String(msg.chat?.id) !== String(chatId)) continue;
              if ((msg.date ?? 0) < bootSec) continue;
              const match = msg.text.trim().match(/^\/([a-zA-Z0-9_]+)(?:@[a-zA-Z0-9_]+)?(?:\s+([\s\S]*))?$/);
              if (!match) continue;
              const cmd = match[1].toLowerCase();
              const arg = (match[2] ?? '').trim();
              try {
                const reply = await onCommand(cmd, arg);
                if (reply) await post(reply);
              } catch (err) {
                await post(`❌ <b>Command failed</b>\n${escHtml(err?.message || 'Unknown error')}`).catch(() => {});
              }
            }
          } else {
            delayMs = 10000;
          }
        } catch {
          delayMs = 10000;
        }
        if (polling) await new Promise(r => setTimeout(r, delayMs));
      }
    })();
  }

  function stopPolling() { polling = false; }

  return { configured, notify, sendTest, post, startPolling, stopPolling, escHtml };
}
