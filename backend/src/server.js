import { openDatabase } from './database.js';
import { createApp } from './app.js';

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT 需為 1–65535 的整數。');
const db = openDatabase(process.env.DATABASE_PATH || './data/events.sqlite');
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
for (const origin of allowedOrigins) {
  const parsed = new URL(origin);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) throw new Error('ALLOWED_ORIGINS 請填寫完整 HTTP(S) 來源，例如 http://localhost:5173。');
}
const server = createApp(db, { allowedOrigins });
server.once('error', error => { console.error(`無法啟動 API：${error.code || 'UNKNOWN_ERROR'}`); db.close(); process.exitCode = 1; });
server.listen(port, host, () => console.log(`API: http://${host}:${port}/api/health`));
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close(() => db.close());
  setTimeout(() => { server.closeAllConnections(); }, 5000).unref();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
