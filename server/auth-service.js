const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { Pool } = require('pg');
const scrypt = promisify(crypto.scrypt);
const pool = new Pool({ connectionTimeoutMillis: 5000 });
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const fields = 'id,name,email,role,campus_identity,gender,email_verified_at';
const publicUser = u => ({ ...Object.fromEntries(fields.split(',').map(k => [k,u[k]])), email_verified: !!u.email_verified_at });
function config(env = process.env) {
  const domains = (env.ALLOWED_CAMPUS_EMAIL_DOMAINS || '').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  if (!domains.length || domains.some(x=>!/^[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]{2,}$/.test(x))) throw new Error('請設定 ALLOWED_CAMPUS_EMAIL_DOMAINS 精確校園網域清單');
  if (!env.JWT_SECRET) throw new Error('請設定 JWT_SECRET');
  let url; try { url = new URL(env.PUBLIC_APP_URL); } catch { throw new Error('請設定 PUBLIC_APP_URL'); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)))) throw new Error('PUBLIC_APP_URL 必須為 HTTPS origin；本機可使用 HTTP');
  for (const key of ['SMTP_HOST','SMTP_PORT','MAIL_FROM']) if (!env[key]) throw new Error(`請設定 ${key}`);
  if (!/^\d+$/.test(env.SMTP_PORT) || +env.SMTP_PORT < 1 || +env.SMTP_PORT > 65535) throw new Error('SMTP_PORT 設定無效');
  if (env.SMTP_SECURE && !['true','false'].includes(env.SMTP_SECURE)) throw new Error('SMTP_SECURE 必須為 true 或 false');
  if (!!env.SMTP_USER !== !!env.SMTP_PASS) throw new Error('SMTP_USER 與 SMTP_PASS 必須成對設定');
  const ttl = Number(env.EMAIL_VERIFICATION_TTL_MINUTES || 1440);
  if (!Number.isFinite(ttl) || ttl <= 0 || ttl > 10080) throw new Error('EMAIL_VERIFICATION_TTL_MINUTES 設定無效');
  return { domains, url: url.origin, ttl };
}
function email(value) {
  if (typeof value !== 'string') throw fail(400,'請輸入有效 Email');
  const e=value.trim().toLowerCase();
  if (e.length>100 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]{2,}$/.test(e)) throw fail(400,'請輸入有效 Email（上限 100 字）');
  return e;
}
function validate(data, settings) {
  const e=email(data.email);
  if (!settings.domains.includes(e.split('@')[1])) throw fail(400,'請使用系統允許的校園 Email');
  if (typeof data.name!=='string' || !data.name.trim() || data.name.trim().length>100) throw fail(400,'姓名必填且上限 100 字');
  if (typeof data.password!=='string' || data.password.length<8 || data.password.length>128) throw fail(400,'密碼須為 8～128 字元');
  if (!['student','teacher','staff'].includes(data.campus_identity)) throw fail(400,'請選擇校園身分');
  if (data.gender!=null && (typeof data.gender!=='string' || data.gender.length>20)) throw fail(400,'性別上限 20 字');
  return {name:data.name.trim(), email:e, password:data.password, campus_identity:data.campus_identity,gender:data.gender || null};
}
async function hashPassword(password) {
  const salt=crypto.randomBytes(16).toString('hex');
  return `scrypt$${salt}$${(await scrypt(password,salt,64)).toString('hex')}`;
}
async function checkPassword(password, hash) {
  if (typeof hash!=='string' || !/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(hash)) return false;
  const [,salt,value]=hash.split('$');
  return crypto.timingSafeEqual(await scrypt(password,salt,64),Buffer.from(value,'hex'));
}
const digest = token => crypto.createHash('sha256').update(token).digest('hex');
function createAuthService({database=pool, settings, sendMail}={}) {
  const cfg = () => settings || config();
  async function transaction(fn) {
    const c=await database.connect();
    try { await c.query('BEGIN'); const out=await fn(c); await c.query('COMMIT'); return out; }
    catch(e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  }
  async function issue(c,user) {
    const token=crypto.randomBytes(32).toString('base64url');
    await c.query('DELETE FROM email_verification_tokens WHERE user_id=$1 AND used_at IS NULL',[user.id]);
    await c.query(`INSERT INTO email_verification_tokens(user_id,token_hash,expires_at) VALUES($1,$2,CURRENT_TIMESTAMP + $3 * INTERVAL '1 minute')`,[user.id,digest(token),cfg().ttl]);
    await c.query('INSERT INTO email_verification_deliveries(user_id) VALUES($1)',[user.id]);
    return token;
  }
  async function deliver(user,token) {
    const url=`${cfg().url}/verify-email.html#token=${token}`;
    try { await sendMail({to:user.email,subject:'海大活動報名系統：請驗證校園 Email',text:`請開啟連結並按確認完成信箱驗證：${url}\n有效期限 ${cfg().ttl} 分鐘。新信會取代舊連結。`}); return true; }
    catch { return false; } // 不記錄 SMTP 錯誤，以免包含憑證或原始 token。
  }
  return {
    async register(data) {
      const d=validate(data,cfg()); const hash=await hashPassword(d.password);
      let saved;
      try { saved=await transaction(async c=>{
        const {rows}=await c.query(`INSERT INTO users(name,email,password_hash,campus_identity,gender,role) VALUES($1,$2,$3,$4,$5,'user') RETURNING ${fields}`,[d.name,d.email,hash,d.campus_identity,d.gender]);
        return {user:rows[0],token:await issue(c,rows[0])};
      }); } catch(e) { if(e.code==='23505') throw fail(409,'此 Email 已註冊'); throw e; }
      const sent=await deliver(saved.user,saved.token);
      return {message:sent?'帳號已建立，驗證信已寄出，請檢查收件匣或垃圾郵件':'帳號已建立，驗證信寄送失敗，請稍後重新寄送',data:publicUser(saved.user),verification_email:{status:sent?'sent':'failed'}};
    },
    async login(data) {
      const e=email(data.email);
      if(typeof data.password!=='string' || !data.password || data.password.length>128) throw fail(400,'請輸入有效密碼');
      const {rows}=await database.query(`SELECT ${fields},password_hash FROM users WHERE lower(trim(email))=$1`,[e]);
      // 查無使用者也執行同成本 scrypt，減少明顯時間差。
      const hash=rows[0]?.password_hash || `scrypt$${'0'.repeat(32)}$${'0'.repeat(128)}`;
      if(!await checkPassword(data.password,hash) || !rows[0]) throw fail(401,'帳號或密碼錯誤');
      return publicUser(rows[0]);
    },
    async me(id) {
      const {rows}=await database.query(`SELECT ${fields} FROM users WHERE id=$1`,[id]);
      if(!rows[0]) throw fail(401,'帳號不存在，請重新登入');
      return publicUser(rows[0]);
    },
    async verify(token) {
      if(typeof token!=='string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw fail(400,'驗證連結無效');
      return transaction(async c=>{
        // 與重寄相同：先鎖使用者，後鎖 token，避免互鎖與舊信併發驗證。
        const found=await c.query('SELECT user_id FROM email_verification_tokens WHERE token_hash=$1',[digest(token)]);
        if(!found.rows[0]) throw fail(400,'驗證連結無效');
        await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[found.rows[0].user_id]);
        const {rows}=await c.query('SELECT *, expires_at <= clock_timestamp() AS expired FROM email_verification_tokens WHERE token_hash=$1 FOR UPDATE',[digest(token)]);
        const t=rows[0]; if(!t) throw fail(400,'驗證連結無效');
        if(t.used_at) throw fail(409,'驗證連結已使用，請登入確認目前狀態');
        if(t.expired) throw fail(410,'驗證連結已過期，請重新寄送');
        await c.query('UPDATE email_verification_tokens SET used_at=clock_timestamp() WHERE id=$1',[t.id]);
        await c.query('UPDATE users SET email_verified_at=COALESCE(email_verified_at,clock_timestamp()) WHERE id=$1',[t.user_id]);
        return {message:'信箱驗證成功'};
      });
    },
    async resend(value,ip) {
      const e=email(value);
      const pending=await transaction(async c=>{
        // 來源 IP 使用摘要與持久化 row lock，跨程序共用；每小時最多 20 次。
        const key=digest(ip || 'unknown');
        await c.query('INSERT INTO email_verification_sources(source_hash) VALUES($1) ON CONFLICT DO NOTHING',[key]);
        const source=(await c.query('SELECT *, window_start <= clock_timestamp() - INTERVAL \'1 hour\' AS reset FROM email_verification_sources WHERE source_hash=$1 FOR UPDATE',[key])).rows[0];
        if(!source.reset && source.attempts>=20) throw Object.assign(fail(429,'操作過於頻繁，請稍後重試'),{retryAfter:3600});
        await c.query(`UPDATE email_verification_sources SET attempts=CASE WHEN $2 THEN 1 ELSE attempts+1 END, window_start=CASE WHEN $2 THEN clock_timestamp() ELSE window_start END WHERE source_hash=$1`,[key,source.reset]);
        const {rows}=await c.query(`SELECT ${fields} FROM users WHERE lower(trim(email))=$1 FOR UPDATE`,[e]);
        const u=rows[0]; if(!u || u.email_verified_at) return null;
        const recent=(await c.query(`SELECT count(*)::int AS count, EXTRACT(EPOCH FROM (MAX(created_at)+INTERVAL '60 seconds'-clock_timestamp())) AS wait FROM email_verification_deliveries WHERE user_id=$1 AND created_at > clock_timestamp()-INTERVAL '1 hour'`,[u.id])).rows[0];
        if(Number(recent.count)>=5 || Number(recent.wait)>0) throw Object.assign(fail(429,'請稍後重新寄送'),{retryAfter:Number(recent.count)>=5?3600:Math.ceil(Number(recent.wait))});
        return {user:u,token:await issue(c,u)};
      });
      if(pending && !await deliver(pending.user,pending.token)) throw fail(503,'驗證信寄送失敗，請稍後重新寄送');
      return {message:'若帳號需要驗證，系統將寄送驗證信'};
    }
  };
}
module.exports={createAuthService,config,email,validate,hashPassword,checkPassword,digest,publicUser,pool,fail};
