const getRoutes = new Set(['auth', 'state']);
const postRoutes = new Set(['auth', 'assets', 'strategy', 'strategy-preview', 'knowledge', 'bot', 'settings', 'profile', 'demo', 'backtest', 'portfolio-replay', 'portfolio-session']);
const json = (status, error) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
const maxBodyBytes = 220000;

export async function handleBridge(request, env = process.env, upstreamFetch = fetch) {
  const url = new URL(request.url);
  const route = url.searchParams.get('route');
  const post = request.method === 'POST';
  const allowed = post ? postRoutes : getRoutes;
  if ((!post && request.method !== 'GET') || !allowed.has(route)) return json(404, 'Unknown API route.');
  if (post && (request.headers.get('origin') !== url.origin || !/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? ''))) {
    return json(403, 'Use a same-origin JSON request.');
  }
  let worker;
  try { worker = new URL(env.FASTTRADER_WORKER_URL); }
  catch { return json(503, 'The FastTrader worker is not configured.'); }
  const secret = env.WORKER_SHARED_SECRET;
  if (worker.protocol !== 'https:' || worker.username || worker.password || !secret || secret.length < 32) {
    return json(503, 'The FastTrader worker is not configured.');
  }
  const headers = new Headers({ 'x-fasttrader-worker-secret': secret, Accept: 'application/json' });
  const cookie = request.headers.get('cookie')?.match(/(?:^|;\s*)(ft_session=[\w-]{43})(?:;|$)/)?.[1];
  if (cookie) headers.set('Cookie', cookie);
  const idem = request.headers.get('idempotency-key')?.trim();
  if (idem && /^[a-zA-Z0-9_-]{8,80}$/.test(idem)) headers.set('Idempotency-Key', idem);
  const clientIp = (request.headers.get('x-forwarded-for')?.split(',')[0] || request.headers.get('x-real-ip') || '').trim().slice(0, 64);
  if (clientIp) headers.set('x-fasttrader-client-ip', clientIp);
  let body;
  if (post) {
    headers.set('Content-Type', 'application/json');
    const reader = request.body?.getReader();
    if (!reader) return json(400, 'JSON body required.');
    const chunks = [];
    let bytes = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > maxBodyBytes) {
          await reader.cancel();
          return json(413, 'Request too large.');
        }
        chunks.push(value);
      }
    } catch { return json(400, 'Unable to read request body.'); }
    body = Buffer.concat(chunks, bytes);
  }
  const timeoutMs = ['backtest', 'strategy-preview', 'portfolio-replay'].includes(route) ? 65000
    : ['bot', 'strategy', 'profile', 'knowledge', 'settings', 'portfolio-session'].includes(route) ? 25000 : 15000;
  try {
    const response = await upstreamFetch(new URL('/api/' + route, worker), {
      method: request.method, headers, body, redirect: 'error', cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.headers.get('content-type')?.startsWith('application/json')) return json(502, 'The FastTrader worker returned an unexpected response.');
    const output = new Headers({
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer'
    });
    const setCookie = route === 'auth' && response.headers.get('set-cookie');
    if (setCookie) output.set('Set-Cookie', setCookie);
    return new Response(response.body, { status: response.status, headers: output });
  } catch (error) {
    if (error?.name === 'TimeoutError') return json(504, 'The FastTrader worker did not respond in time.');
    return json(502, 'The FastTrader worker is unreachable.');
  }
}

export default { fetch: request => handleBridge(request) };
