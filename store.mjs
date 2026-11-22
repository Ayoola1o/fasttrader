export function createStore(env = process.env) {
  const rawUrl = env.SUPABASE_URL?.trim();
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY)?.trim();
  const noop = {
    enabled: false,
    load: async () => null,
    save: async () => {},
    loadProfile: async () => null,
    saveProfile: async () => {},
    syncTrades: async () => {}
  };
  if (!rawUrl || !key) return noop;
  let base;
  try {
    base = new URL(rawUrl);
    if (base.protocol !== 'https:') return noop;
  } catch {
    return noop;
  }
  const rest = table => new URL('/rest/v1/' + table, base).href;
  const headers = {
    apikey: key,
    Authorization: 'Bearer ' + key,
    'Content-Type': 'application/json'
  };
  const lastSaved = new Map();

  async function load(storeKey) {
    try {
      const res = await fetch(rest('fasttrader_store') + '?key=eq.' + encodeURIComponent(storeKey) + '&select=value', {
        headers,
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) return null;
      const rows = await res.json();
      return rows?.[0]?.value ?? null;
    } catch (error) {
      console.error('Supabase load failed (' + storeKey + '):', error.message);
      return null;
    }
  }

  async function save(storeKey, value) {
    const serialized = JSON.stringify(value);
    if (lastSaved.get(storeKey) === serialized) return;
    try {
      const res = await fetch(rest('fasttrader_store') + '?on_conflict=key', {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify([{ key: storeKey, value, updated_at: new Date().toISOString() }]),
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) throw Error('HTTP ' + res.status);
      lastSaved.set(storeKey, serialized);
    } catch (error) {
      console.error('Supabase save failed (' + storeKey + '):', error.message);
    }
  }

  async function loadProfile(accountKey) {
    try {
      const res = await fetch(rest('user_profiles') + '?account_key=eq.' + encodeURIComponent(accountKey) + '&select=*', {
        headers,
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) return null;
      const rows = await res.json();
      const row = rows?.[0];
      if (!row) return null;
      return {
        name: row.display_name || 'Paper Trader',
        username: row.username || '',
        email: row.email || '',
        bio: row.bio || '',
        avatar: row.avatar_url || '',
        timezone: row.timezone || 'UTC',
        riskTier: row.risk_tier || 'moderate',
        tradingStyle: row.trading_style || 'swing',
        offlineSync: row.offline_sync !== false
      };
    } catch (error) {
      console.error('Supabase loadProfile failed:', error.message);
      return null;
    }
  }

  async function saveProfile(accountKey, profile) {
    const row = {
      account_key: accountKey,
      display_name: profile.name || 'Paper Trader',
      username: profile.username || '',
      email: profile.email || '',
      bio: profile.bio || '',
      avatar_url: profile.avatar || '',
      timezone: profile.timezone || 'UTC',
      risk_tier: profile.riskTier || 'moderate',
      trading_style: profile.tradingStyle || 'swing',
      offline_sync: profile.offlineSync !== false,
      updated_at: new Date().toISOString()
    };
    const serialized = JSON.stringify({ ...row, updated_at: '' });
    if (lastSaved.get('profile:' + accountKey) === serialized) return;
    try {
      const res = await fetch(rest('user_profiles') + '?on_conflict=account_key', {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify([row]),
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) throw Error('HTTP ' + res.status);
      lastSaved.set('profile:' + accountKey, serialized);
    } catch (error) {
      console.error('Supabase saveProfile failed:', error.message);
    }
  }

  async function syncTrades(accountKey, orders) {
    const owned = (orders ?? []).filter(o => o.owned && o.client).slice(0, 200);
    if (!owned.length) return;
    const rows = owned.map(o => ({
      account_key: accountKey,
      client_order_id: o.client,
      broker_order_id: o.id ?? null,
      strategy_id: o.strategyId ?? null,
      strategy_name: o.strategy ?? null,
      strategy_version: Number.isInteger(o.version) ? o.version : null,
      symbol: o.symbol,
      side: o.side,
      qty: Number(o.qty) || 0,
      filled: Number(o.filled) || 0,
      price: Number.isFinite(o.price) ? o.price : null,
      limit_price: Number.isFinite(o.limitPrice) ? o.limitPrice : null,
      status: o.status || 'unknown',
      pnl: Number.isFinite(o.pnl) ? o.pnl : null,
      submitted_at: o.t || null,
      filled_at: o.filledAt || null,
      updated_at: new Date().toISOString()
    }));
    const fingerprint = JSON.stringify(rows.map(({ updated_at, ...r }) => r));
    if (lastSaved.get('trades:' + accountKey) === fingerprint) return;
    try {
      const res = await fetch(rest('user_trades') + '?on_conflict=account_key,client_order_id', {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(rows),
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) throw Error('HTTP ' + res.status);
      lastSaved.set('trades:' + accountKey, fingerprint);
    } catch (error) {
      console.error('Supabase syncTrades failed:', error.message);
    }
  }

  return { enabled: true, load, save, loadProfile, saveProfile, syncTrades };
}
