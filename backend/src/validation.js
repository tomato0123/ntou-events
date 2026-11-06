import { ApiError } from './errors.js';

export function objectFields(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'INVALID_BODY', '請傳入 JSON 物件。');
  const unknown = Object.keys(body).filter(key => !allowed.includes(key));
  if (unknown.length) throw new ApiError(400, 'UNKNOWN_FIELDS', '包含不支援的欄位。', { fields: unknown });
}

function text(value, field, max, min = 1) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${field}需為 ${min}–${max} 字的有效文字。`, { field });
  }
  return value.trim();
}

export function validateSignup(body) {
  objectFields(body, ['name', 'studentId', 'email', 'department', 'identity', 'password']);
  const name = text(body.name, 'name', 40);
  const studentId = text(body.studentId, 'studentId', 20, 4).toUpperCase();
  if (!/^[A-Z0-9-]{4,20}$/.test(studentId)) throw new ApiError(400, 'VALIDATION_ERROR', '學號／員工編號只能包含英數字及連字號。', { field: 'studentId' });
  const email = validateEmail(body.email);
  const department = text(body.department, 'department', 60);
  const identity = body.identity ?? 'student';
  if (!['student', 'faculty', 'staff'].includes(identity)) throw new ApiError(400, 'VALIDATION_ERROR', 'identity 需為 student、faculty 或 staff。', { field: 'identity' });
  validatePassword(body.password);
  return { name, studentId, email, department, identity, password: body.password };
}

export function validateEmail(value) {
  const email = text(value, 'email', 120).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, 'VALIDATION_ERROR', '電子信箱格式不正確。', { field: 'email' });
  return email;
}

export function validatePassword(value) {
  if (typeof value !== 'string' || value.length < 10 || value.length > 128 || Buffer.byteLength(value) > 512) {
    throw new ApiError(400, 'VALIDATION_ERROR', '密碼需為 10–128 字，最多 512 bytes。', { field: 'password' });
  }
}

export function pagination(searchParams) {
  const integer = (key, fallback, min, max) => {
    const raw = searchParams.get(key);
    if (raw === null) return fallback;
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) < min || Number(raw) > max) {
      throw new ApiError(400, 'INVALID_PAGINATION', `${key} 需為 ${min}–${max} 的整數。`);
    }
    return Number(raw);
  };
  return { limit: integer('limit', 20, 1, 100), offset: integer('offset', 0, 0, 1_000_000) };
}
