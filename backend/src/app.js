import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { AuthService } from './auth.js';
import { RegistrationService } from './registrations.js';
import { ApiError } from './errors.js';
import { objectFields, pagination } from './validation.js';

const MAX_BODY = 16 * 1024;

function jsonResponse(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function jsonBody(req, optional = false) {
  if (optional && !req.headers['content-length'] && !req.headers['transfer-encoding']) return {};
  if (optional && req.headers['content-length'] === '0') return {};
  if ((req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') {
    req.resume();
    throw new ApiError(415, 'JSON_REQUIRED', 'Content-Type 請設為 application/json。');
  }
  if (Number(req.headers['content-length']) > MAX_BODY) {
    req.resume();
    throw new ApiError(413, 'BODY_TOO_LARGE', '請求內容不得超過 16 KiB。');
  }
  const raw = await new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    let exceeded = false;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) {
        exceeded = true;
        chunks.length = 0;
        reject(new ApiError(413, 'BODY_TOO_LARGE', '請求內容不得超過 16 KiB。'));
      } else if (!exceeded) chunks.push(chunk);
    });
    req.once('end', () => { if (!exceeded) resolve(Buffer.concat(chunks).toString('utf8')); });
    req.once('error', reject);
    req.once('aborted', () => reject(new ApiError(400, 'REQUEST_ABORTED', '請求已中斷。')));
  });
  if (!raw.trim() && optional) return {};
  let body;
  try { body = JSON.parse(raw); } catch { throw new ApiError(400, 'INVALID_JSON', 'JSON 格式不正確。'); }
  objectFields(body, Object.keys(body || {}));
  return body;
}

// 登入與註冊的簡易 IP 限流。只信任 socket 位址，不信任用戶提供的 X-Forwarded-For。
function createAuthLimiter(now, max) {
  const buckets = new Map();
  const windowMs = 15 * 60 * 1000;
  return (key, res) => {
    const timestamp = now();
    for (const [ip, value] of buckets) if (value.resetAt <= timestamp) buckets.delete(ip);
    let value = buckets.get(key);
    if (!value) {
      if (buckets.size >= 10_000) throw new ApiError(429, 'RATE_LIMITED', '請稍後再試。');
      value = { count: 0, resetAt: timestamp + windowMs };
      buckets.set(key, value);
    }
    value.count++;
    if (value.count > max) {
      res.setHeader('Retry-After', Math.ceil((value.resetAt - timestamp) / 1000));
      throw new ApiError(429, 'RATE_LIMITED', '登入或註冊次數過多，請稍後再試。');
    }
  };
}

export function createApp(db, { now = Date.now, allowedOrigins = [], authLimit = 30, logger = console } = {}) {
  const auth = new AuthService(db, now);
  const registrations = new RegistrationService(db, now);
  const checkRate = createAuthLimiter(now, authLimit);
  const origins = new Set(allowedOrigins);
  const server = http.createServer(async (req, res) => {
    const requestId = randomUUID();
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const origin = req.headers.origin;
      if (origin) {
        if (!origins.has(origin)) throw new ApiError(403, 'ORIGIN_NOT_ALLOWED', '此前端來源尚未獲允許。');
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      }
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      const url = new URL(req.url, 'http://localhost');
      const pathname = url.pathname.replace(/\/$/, '') || '/';
      const method = req.method;
      let status = 200;
      let data;
      if (method === 'GET' && pathname === '/api/health') {
        db.prepare('SELECT 1').get();
        data = { status: 'ok' };
      } else if (method === 'POST' && ['/api/auth/register', '/api/auth/login'].includes(pathname)) {
        checkRate(req.socket.remoteAddress || 'unknown', res);
        const body = await jsonBody(req);
        data = pathname.endsWith('/register') ? await auth.signup(body) : await auth.login(body);
        status = pathname.endsWith('/register') ? 201 : 200;
      } else if (method === 'POST' && pathname === '/api/auth/logout') {
        const session = auth.authenticate(req.headers.authorization);
        objectFields(await jsonBody(req, true), []);
        auth.logout(session.tokenHash);
        data = { loggedOut: true };
      } else if (method === 'GET' && pathname === '/api/me') {
        data = auth.authenticate(req.headers.authorization).user;
      } else if (method === 'GET' && pathname === '/api/events') {
        const q = url.searchParams.get('q')?.trim() || '';
        const category = url.searchParams.get('category')?.trim() || '';
        if (q.length > 100 || category.length > 40) throw new ApiError(400, 'INVALID_FILTER', '搜尋關鍵字或類別過長。');
        data = registrations.listEvents({ ...pagination(url.searchParams), q, category });
      } else if (method === 'GET' && /^\/api\/events\/[^/]+$/.test(pathname)) {
        data = registrations.event(decodeURIComponent(pathname.split('/')[3]));
      } else if (method === 'POST' && /^\/api\/events\/[^/]+\/registrations$/.test(pathname)) {
        const { user } = auth.authenticate(req.headers.authorization);
        objectFields(await jsonBody(req, true), []);
        data = registrations.register(decodeURIComponent(pathname.split('/')[3]), user.id);
        status = 201;
      } else if (method === 'GET' && pathname === '/api/registrations/me') {
        const { user } = auth.authenticate(req.headers.authorization);
        const filter = url.searchParams.get('status') || '';
        if (filter && !['confirmed', 'waitlisted', 'cancelled'].includes(filter)) throw new ApiError(400, 'INVALID_STATUS', 'status 需為 confirmed、waitlisted 或 cancelled。');
        data = registrations.listMine(user.id, { ...pagination(url.searchParams), status: filter });
      } else if (['GET', 'DELETE'].includes(method) && /^\/api\/registrations\/[^/]+$/.test(pathname)) {
        const { user } = auth.authenticate(req.headers.authorization);
        const id = decodeURIComponent(pathname.split('/')[3]);
        if (method === 'DELETE') objectFields(await jsonBody(req, true), []);
        data = method === 'GET' ? registrations.get(id, user.id) : registrations.cancel(id, user.id);
      } else throw new ApiError(404, 'ROUTE_NOT_FOUND', '找不到 API 路徑或不支援此 HTTP 方法。');
      jsonResponse(res, status, { success: true, data });
    } catch (error) {
      if (error instanceof URIError || error?.code === 'ERR_INVALID_URL') error = new ApiError(400, 'INVALID_URL', '網址格式不正確。');
      if (error?.errcode === 5 || error?.code === 'SQLITE_BUSY') error = new ApiError(503, 'DATABASE_BUSY', '系統忙碌中，請稍後重試。');
      const known = error instanceof ApiError;
      if (!known) logger.error({ requestId, code: 'INTERNAL_ERROR' });
      if (!res.headersSent && !res.destroyed) jsonResponse(res, known ? error.status : 500, {
        success: false,
        error: { code: known ? error.code : 'INTERNAL_ERROR', message: known ? error.message : '伺服器暫時無法處理請求。', ...(known && error.details ? { details: error.details } : {}), requestId },
      });
    }
  });
  server.headersTimeout = 10_000;
  server.requestTimeout = 15_000;
  server.keepAliveTimeout = 5_000;
  return server;
}
