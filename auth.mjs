import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const digest = value => createHash('sha256').update(value).digest();
export const sameSecret = (a, b) => typeof a === 'string' && typeof b === 'string' && timingSafeEqual(digest(a), digest(b));
const cookieName = 'ft_session';
const duration = 12 * 60 * 60 * 1000;

export async function createAuth({ file, required, secure, signupCode }) {
  let store = { owner: null, sessions: {} };
  try { store = JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  required ||= Boolean(store.owner);
  const attempts = [];
  let queue = Promise.resolve();
  const keyFor = cookie => {
    const token = cookie?.match(/(?:^|;\s*)ft_session=([a-zA-Z0-9_-]{43})(?:;|$)/)?.[1];
    return token && digest(token).toString('hex');
  };
  const authenticated = cookie => !required || (store.sessions[keyFor(cookie)] ?? 0) > Date.now();
  const status = cookie => ({
    required, authenticated: authenticated(cookie), canSignup: required && !store.owner && Boolean(signupCode)
  });
  const sessionCookie = (token, maxAge) => cookieName + '=' + token + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + maxAge + (secure ? '; Secure' : '');
  const save = async next => {
    await writeFile(file + '.tmp', JSON.stringify(next), { mode: 0o600 });
    await rename(file + '.tmp', file);
    store = next;
  };
  const fail = (message, code = 400) => { throw Object.assign(Error(message), { status: code }); };
  const change = async (input, cookie) => {
    if (!required) fail('Sign-in is disabled on this local workspace.');
    if (!['signup','login','logout'].includes(input?.action)) fail('Invalid sign-in request.');
    if (input.action !== 'logout') {
      const now = Date.now();
      while (attempts.length && attempts[0] <= now - 60000) attempts.shift();
      if (attempts.length >= 10) fail('Too many sign-in attempts. Try again in a minute.', 429);
      attempts.push(now);
    } else if (!authenticated(cookie)) {
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
        const hash = (await derive(password, owner?.salt ?? 'unconfigured', 64)).toString('hex');
        if (!owner || !sameSecret(email, owner.email) || !sameSecret(hash, owner.hash)) fail('Email or password is incorrect.', 401);
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
  return { status, authenticated, change };
}
