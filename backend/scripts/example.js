// 先執行 npm run seed、npm start，再在另一個終端機執行 npm run example。
// 此腳本只建立虛構測試帳號與測試報名，不輸出登入 token 或密碼。
import { randomUUID } from 'node:crypto';
const base = process.env.API_URL || 'http://127.0.0.1:3000';
const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
let token;
async function request(method, route, body) {
  const response = await fetch(base + route, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${result.error.code}: ${result.error.message}`);
  return result.data;
}
try {
  const account = await request('POST', '/api/auth/register', {
    name: '測試同學', studentId: 'T' + suffix, email: `test-${suffix}@example.com`,
    department: '資訊工程學系', identity: 'student', password: randomUUID(),
  });
  token = account.token;
  const result = await request('POST', '/api/events/ocean-workshop/registrations');
  console.log('報名結果：', result.code, result.statusLabel);
  const mine = await request('GET', '/api/registrations/me');
  console.log('我的報名筆數：', mine.total);
  const cancelled = await request('DELETE', `/api/registrations/${result.id}`);
  console.log('取消結果：', cancelled.statusLabel);
  await request('POST', '/api/auth/logout');
} catch (error) { console.error(error.message); process.exitCode = 1; }
