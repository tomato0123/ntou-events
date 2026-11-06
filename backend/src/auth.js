import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { ApiError } from './errors.js';
import { objectFields, validateEmail, validatePassword, validateSignup } from './validation.js';
import { transaction } from './database.js';

const deriveKey = promisify(scrypt);
const scryptOptions = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const hashToken = token => createHash('sha256').update(token).digest('hex');
const SESSION_TTL = 8 * 60 * 60 * 1000;
const dummyHash = `scrypt:${'00'.repeat(16)}:${'00'.repeat(64)}`;

export function publicUser(row) {
  return { id: row.id, name: row.name, studentId: row.student_id, email: row.email, department: row.department, identity: row.identity, createdAt: new Date(row.created_at).toISOString() };
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const digest = await deriveKey(password, salt, 64, scryptOptions);
  return `scrypt:${salt}:${digest.toString('hex')}`;
}

async function passwordMatches(password, encoded) {
  const [, salt, hex] = encoded.split(':');
  const digest = await deriveKey(password, salt, 64, scryptOptions);
  const expected = Buffer.from(hex, 'hex');
  return digest.length === expected.length && timingSafeEqual(digest, expected);
}

export class AuthService {
  constructor(db, now = Date.now) { this.db = db; this.now = now; }

  sessionFor(user) {
    const now = this.now();
    const token = randomBytes(32).toString('base64url');
    this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
    this.db.prepare('INSERT INTO sessions(token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .run(hashToken(token), user.id, now, now + SESSION_TTL);
    return { token, tokenType: 'Bearer', expiresAt: new Date(now + SESSION_TTL).toISOString(), user: publicUser(user) };
  }

  async signup(body) {
    const input = validateSignup(body);
    const passwordHash = await hashPassword(input.password);
    const id = randomUUID();
    try {
      return transaction(this.db, () => {
        this.db.prepare(`INSERT INTO users (id, name, student_id, email, department, identity, password_hash, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, input.name, input.studentId, input.email, input.department, input.identity, passwordHash, this.now());
        return this.sessionFor(this.db.prepare('SELECT * FROM users WHERE id = ?').get(id));
      });
    } catch (error) {
      if (error.errcode === 2067 || error.code?.includes('CONSTRAINT') || /UNIQUE constraint failed/.test(error.message)) {
        throw new ApiError(409, 'ACCOUNT_EXISTS', '電子信箱或學號／員工編號已註冊。');
      }
      throw error;
    }
  }

  async login(body) {
    objectFields(body, ['email', 'password']);
    const email = validateEmail(body.email);
    validatePassword(body.password);
    const user = this.db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email);
    const valid = await passwordMatches(body.password, user?.password_hash || dummyHash);
    if (!user || !valid) throw new ApiError(401, 'INVALID_CREDENTIALS', '電子信箱或密碼不正確。');
    return this.sessionFor(user);
  }

  authenticate(authorization) {
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(authorization || '');
    if (!match) throw new ApiError(401, 'AUTH_REQUIRED', '請先登入，並提供有效的 Bearer token。');
    const tokenHash = hashToken(match[1]);
    const row = this.db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?`).get(tokenHash, this.now());
    if (!row) throw new ApiError(401, 'SESSION_EXPIRED', '登入已過期或已登出，請重新登入。');
    return { user: publicUser(row), tokenHash };
  }

  logout(tokenHash) { this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash); }
}
