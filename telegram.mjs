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
  const endpoint = configured ? `https://api.telegram.org/bot${token}/sendMessage` : null;
  const throttle = new Map();

  async function post(text) {
    if (!configured) throw Error('Configure TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in the server environment.');
    const res = await request(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: AbortSignal.timeout(5500)
    });
    if (!res.ok) {
      let detail = '';
      try {
        const body = await res.json();
        if (body?.description) detail = ': ' + body.description;
      } catch {}
      throw Error('Telegram request failed (' + res.status + ')' + detail);
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
      `Time: ${escHtml(new Date().toISOString())}`
    ].join('\n');
    await post(text);
    return { sent: true };
  }

  return { configured, notify, sendTest };
}
