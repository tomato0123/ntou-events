import { randomUUID } from 'node:crypto';
import { ApiError, requireCondition } from './errors.js';
import { transaction } from './database.js';

const eventQuery = `SELECT e.*,
  (SELECT count(*) FROM registrations r WHERE r.event_id = e.id AND r.status = 'confirmed') AS confirmed_count,
  (SELECT count(*) FROM registrations r WHERE r.event_id = e.id AND r.status = 'waitlisted') AS waitlisted_count
  FROM events e`;
const iso = value => value == null ? null : new Date(value).toISOString();
const labels = { confirmed: '正取', waitlisted: '候補', cancelled: '已取消' };

function serializeEvent(row, now) {
  const remaining = Math.max(0, row.capacity - row.confirmed_count);
  let registrationStatus = 'open';
  if (row.status === 'cancelled') registrationStatus = 'cancelled';
  else if (now >= row.starts_at) registrationStatus = 'started';
  else if (now < row.registration_opens_at) registrationStatus = 'not_open';
  else if (now >= row.registration_closes_at) registrationStatus = 'closed';
  else if (remaining === 0) registrationStatus = row.allow_waitlist ? 'waitlist' : 'full';
  return {
    id: row.id, title: row.title, description: row.description, category: row.category,
    location: row.location, organizer: row.organizer, startsAt: iso(row.starts_at), endsAt: iso(row.ends_at),
    registrationOpensAt: iso(row.registration_opens_at), registrationClosesAt: iso(row.registration_closes_at),
    capacity: row.capacity, confirmedCount: row.confirmed_count, waitlistedCount: row.waitlisted_count,
    remaining, allowWaitlist: Boolean(row.allow_waitlist), status: row.status, registrationStatus,
  };
}

export class RegistrationService {
  constructor(db, now = Date.now) { this.db = db; this.now = now; }

  eventRow(id) {
    const row = this.db.prepare(eventQuery + " WHERE e.id = ? AND e.status <> 'draft'").get(id);
    if (!row) throw new ApiError(404, 'EVENT_NOT_FOUND', '找不到活動。');
    return row;
  }

  event(id) { return serializeEvent(this.eventRow(id), this.now()); }

  listEvents({ q = '', category = '', limit = 20, offset = 0 } = {}) {
    const where = ` WHERE e.status = 'published'
      AND (? = '' OR instr(lower(e.title || ' ' || e.description || ' ' || e.location), lower(?)) > 0)
      AND (? = '' OR e.category = ?)`;
    const args = [q, q, category, category];
    const rows = this.db.prepare(eventQuery + where + ' ORDER BY e.starts_at, e.id LIMIT ? OFFSET ?').all(...args, limit, offset);
    const total = this.db.prepare('SELECT count(*) AS count FROM events e' + where).get(...args).count;
    const now = this.now();
    return { items: rows.map(row => serializeEvent(row, now)), total, limit, offset };
  }

  get(id, userId) {
    const row = this.db.prepare('SELECT * FROM registrations WHERE id = ? AND user_id = ?').get(id, userId);
    if (!row) throw new ApiError(404, 'REGISTRATION_NOT_FOUND', '找不到這筆報名紀錄。');
    return this.serializeRegistration(row);
  }

  serializeRegistration(row) {
    const position = row.status === 'waitlisted'
      ? this.db.prepare("SELECT count(*) AS count FROM registrations WHERE event_id = ? AND status = 'waitlisted' AND sequence <= ?").get(row.event_id, row.sequence).count
      : null;
    return {
      id: row.id, code: row.code, status: row.status, statusLabel: labels[row.status], waitlistPosition: position,
      createdAt: iso(row.created_at), cancelledAt: iso(row.cancelled_at), promotedAt: iso(row.promoted_at),
      event: this.event(row.event_id),
    };
  }

  listMine(userId, { status = '', limit = 20, offset = 0 } = {}) {
    const where = " WHERE user_id = ? AND (? = '' OR status = ?)";
    const args = [userId, status, status];
    const rows = this.db.prepare('SELECT * FROM registrations' + where + ' ORDER BY sequence DESC LIMIT ? OFFSET ?').all(...args, limit, offset);
    const total = this.db.prepare('SELECT count(*) AS count FROM registrations' + where).get(...args).count;
    return { items: rows.map(row => this.serializeRegistration(row)), total, limit, offset };
  }

  // 此方法只在 BEGIN IMMEDIATE 交易中使用；依原始報名順序遞補。
  promoteWaitlist(event, now) {
    if (event.status !== 'published' || now >= event.starts_at) return;
    const count = this.db.prepare("SELECT count(*) AS count FROM registrations WHERE event_id = ? AND status = 'confirmed'").get(event.id).count;
    const available = Math.max(0, event.capacity - count);
    if (!available) return;
    const waiting = this.db.prepare("SELECT id FROM registrations WHERE event_id = ? AND status = 'waitlisted' ORDER BY sequence LIMIT ?").all(event.id, available);
    const promote = this.db.prepare("UPDATE registrations SET status = 'confirmed', promoted_at = ? WHERE id = ? AND status = 'waitlisted'");
    for (const record of waiting) promote.run(now, record.id);
  }

  register(eventId, userId) {
    return transaction(this.db, () => {
      const event = this.eventRow(eventId);
      const now = this.now();
      requireCondition(event.status === 'published', 409, 'EVENT_UNAVAILABLE', '活動目前不開放報名。');
      requireCondition(now < event.starts_at, 409, 'EVENT_STARTED', '活動已開始，無法報名。');
      requireCondition(now >= event.registration_opens_at, 409, 'REGISTRATION_NOT_OPEN', '活動尚未開放報名。');
      requireCondition(now < event.registration_closes_at, 409, 'REGISTRATION_CLOSED', '活動報名已截止。');
      const existing = this.db.prepare("SELECT id FROM registrations WHERE event_id = ? AND user_id = ? AND status <> 'cancelled'").get(eventId, userId);
      requireCondition(!existing, 409, 'ALREADY_REGISTERED', '你已報名此活動。', existing ? { registrationId: existing.id } : undefined);
      this.promoteWaitlist(event, now);
      const count = this.db.prepare("SELECT count(*) AS count FROM registrations WHERE event_id = ? AND status = 'confirmed'").get(eventId).count;
      const status = count < event.capacity ? 'confirmed' : 'waitlisted';
      requireCondition(status === 'confirmed' || event.allow_waitlist === 1, 409, 'EVENT_FULL', '活動已額滿，且未開放候補。');
      const id = randomUUID();
      const code = 'REG-' + id.replaceAll('-', '').toUpperCase();
      this.db.prepare('INSERT INTO registrations (id, code, user_id, event_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, code, userId, eventId, status, now);
      return this.get(id, userId);
    });
  }

  cancel(id, userId) {
    return transaction(this.db, () => {
      const record = this.db.prepare('SELECT * FROM registrations WHERE id = ? AND user_id = ?').get(id, userId);
      if (!record) throw new ApiError(404, 'REGISTRATION_NOT_FOUND', '找不到這筆報名紀錄。');
      if (record.status === 'cancelled') return this.get(id, userId);
      const event = this.eventRow(record.event_id);
      const now = this.now();
      requireCondition(now < event.starts_at, 409, 'CANCELLATION_CLOSED', '活動已開始，請聯繫主辦單位處理取消。');
      this.db.prepare("UPDATE registrations SET status = 'cancelled', cancelled_at = ? WHERE id = ?").run(now, id);
      if (record.status === 'confirmed') this.promoteWaitlist(event, now);
      return this.get(id, userId);
    });
  }
}
