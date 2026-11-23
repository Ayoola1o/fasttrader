import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const digest = value => createHash('sha256').update(value).digest();
export const sameSecret = (a, b) => typeof a === 'string' && typeof b === 'string' && timingSafeEqual(digest(a), digest(b));
const cookieName = 'ft_session';
const duration = 12 * 60 * 60 * 1000;

export async function createAuth({ file, required, secure, signupCode, ownerEmail, ownerPassword, remoteStore, storeKey = 'auth' }) {
  let store = { owner: null, sessions: {} };
  const remote = remoteStore?.enabled ? await remoteStore.load(storeKey) : null;
  if (remote && typeof remote === 'object') {
    store = { owner: remote.owner ?? null, sessions: remote.sessions ?? {} };
  } else {
    try { store = JSON.parse(await readFile(file, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  required ||= Boolean(store.owner);
  const attemptsByIp = new Map();
  let queue = Promise.resolve();
  const keyFor = cookie => {
    const token = cookie?.match(/(?:^|;\s*)ft_session=([a-zA-Z0-9_-]{43})(?:;|$)/)?.[1];
    return token && digest(token).toString('hex');
  };
  const authenticated = cookie => !required || (store.sessions[keyFor(cookie)] ?? 0) > Date.now();
  const sessionCount = () => Object.values(store.sessions).filter(exp => exp > Date.now()).length;
  const status = cookie => ({
    required, authenticated: authenticated(cookie), canSignup: required && !store.owner && Boolean(signupCode)
  });
  const sessionCookie = (token, maxAge) => cookieName + '=' + token + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + maxAge + (secure ? '; Secure' : '');
  const save = async next => {
    await writeFile(file + '.tmp', JSON.stringify(next), { mode: 0o600 });
    await rename(file + '.tmp', file);
    store = next;
    if (remoteStore?.enabled) await remoteStore.save(storeKey, next, { force: true });
  };
  const fail = (message, code = 400) => { throw Object.assign(Error(message), { status: code }); };
  const change = async (input, cookie, clientIp = 'local') => {
    if (!required) fail('Sign-in is disabled on this local workspace.');
    if (!['signup','login','logout','change_password','revoke_others'].includes(input?.action)) fail('Invalid sign-in request.');
    if (['signup', 'login', 'change_password'].includes(input.action)) {
      const now = Date.now();
      const bucketKey = String(clientIp || 'local').slice(0, 64);
      const list = (attemptsByIp.get(bucketKey) ?? []).filter(ts => ts > now - 60000);
      if (list.length >= 10) fail('Too many sign-in attempts. Try again in a minute.', 429);
      list.push(now);
      attemptsByIp.set(bucketKey, list);
      if (attemptsByIp.size > 1000) {
        for (const [k, v] of attemptsByIp) {
          if (!v.some(ts => ts > now - 60000)) attemptsByIp.delete(k);
        }
      }
    } else if (input.action === 'logout' && !authenticated(cookie)) {
      return { data: status(), cookie: sessionCookie('', 0) };
    }
    const job = queue.then(async () => {
      if (input?.action === 'logout') {
        const key = keyFor(cookie);
        if (key && store.sessions[key]) {
          const sessions = { ...store.sessions };
          delete sessions[key];
          await save({ ...store, sessions });
        }
        return { data: status(), cookie: sessionCookie('', 0) };
      }
      if (input?.action === 'revoke_others') {
        if (!authenticated(cookie)) fail('Sign in to FastTrader.', 401);
        const key = keyFor(cookie);
        const now = Date.now();
        const prevCount = Object.values(store.sessions).filter(exp => exp > now).length;
        const sessions = key && store.sessions[key] > now ? { [key]: store.sessions[key] } : {};
        await save({ ...store, sessions });
        return { data: { revoked: Math.max(0, prevCount - Object.keys(sessions).length), activeSessions: Object.keys(sessions).length } };
      }
      if (input?.action === 'change_password') {
        if (!authenticated(cookie)) fail('Sign in to FastTrader.', 401);
        const currentPassword = typeof input.currentPassword === 'string' ? input.currentPassword : '';
        const newPassword = typeof input.newPassword === 'string' ? input.newPassword : '';
        if (!currentPassword || !newPassword || newPassword.length < 12 || Buffer.byteLength(newPassword) > 256) {
          fail('Enter your current password and a new password of at least 12 characters.');
        }
        const envOwner = ownerEmail && ownerPassword ? { email: ownerEmail.trim().toLowerCase(), password: ownerPassword } : null;
        const active = store.owner ?? envOwner;
        if (!active) fail('No owner account configured.', 401);
        const ok = active.password
          ? sameSecret(currentPassword, active.password)
          : sameSecret((await derive(currentPassword, active.salt, 64)).toString('hex'), active.hash);
        if (!ok) fail('Current password is incorrect.', 401);
        const salt = randomBytes(16).toString('hex');
        const nextOwner = { email: active.email, salt, hash: (await derive(newPassword, salt, 64)).toString('hex') };
        const token = randomBytes(32).toString('base64url');
        const sessions = { [digest(token).toString('hex')]: Date.now() + duration };
        await save({ owner: nextOwner, sessions });
        return { data: { changed: true, activeSessions: 1 }, cookie: sessionCookie(token, duration / 1000) };
      }
      const now = Date.now();
      const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
      const password = typeof input.password === 'string' ? input.password : '';
      if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254 || !password || Buffer.byteLength(password) > 256) {
        fail('Enter a valid email and password.');
      }
      let owner = store.owner;
      if (input.action === 'signup') {
        if (owner || !signupCode || !sameSecret(input.code, signupCode)) fail('Sign-up is unavailable or the setup code is incorrect.', 403);
        if (password.length < 12) fail('Use a password with at least 12 characters.');
        const salt = randomBytes(16).toString('hex');
        owner = { email, salt, hash: (await derive(password, salt, 64)).toString('hex') };
      } else {
        const envOwner = ownerEmail && ownerPassword ? { email: ownerEmail.trim().toLowerCase(), password: ownerPassword } : null;
        const active = owner ?? envOwner;
        if (!active) fail('No owner account configured. Complete workspace setup first.', 401);
        const ok = active.password
          ? sameSecret(email, active.email) && sameSecret(password, active.password)
          : sameSecret(email, active.email) && sameSecret((await derive(password, active.salt, 64)).toString('hex'), active.hash);
        if (!ok) fail('Email or password is incorrect.', 401);
      }
      const token = randomBytes(32).toString('base64url');
      const sessions = Object.fromEntries(Object.entries(store.sessions).filter(([, expiry]) => expiry > now).slice(-19));
      delete sessions[keyFor(cookie)];
      sessions[digest(token).toString('hex')] = now + duration;
      await save({ owner, sessions });
      return { data: status(cookieName + '=' + token), cookie: sessionCookie(token, duration / 1000) };
    });
    queue = job.catch(() => {});
    return job;
  };
  return { status, authenticated, sessionCount, change };
}
