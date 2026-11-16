const {test}=require('node:test');
const assert=require('node:assert/strict');
process.env.JWT_SECRET='controlled-test-secret-only';
const {createAuthService,validate,config,hashPassword,checkPassword,digest,publicUser}=require('../auth-service');
const {registerForEvent}=require('../registration-service');
const settings={domains:['campus.example'],url:'http://127.0.0.1:8000',ttl:1440};
const input={name:' 同學 ',email:' A@campus.example ',password:' password ',campus_identity:'teacher',role:'admin',email_verified:true};
// 受控 SQL adapter，不等同 PostgreSQL：模擬鎖序列、交易回滾及 DB 時間。
function fixture() {
 let state={users:[],tokens:[],deliveries:[],sources:{},registrations:[]}; let tail=Promise.resolve(); let failUpdate=false;
 const query=async(sql,args=[])=>{
  let rows=[]; const [a,b,c,d,e]=args;
  if(sql.startsWith('INSERT INTO users')) {
   if(state.users.some(u=>u.email===b)) throw Object.assign(new Error(),{code:'23505'});
   const u={id:state.users.length+1,name:a,email:b,password_hash:c,campus_identity:d,gender:e,role:'user',email_verified_at:null};state.users.push(u);rows=[u];
  } else if(sql.startsWith('DELETE FROM email_verification_tokens')) state.tokens=state.tokens.filter(t=>t.user_id!==a || t.used_at);
  else if(sql.startsWith('INSERT INTO email_verification_tokens')) state.tokens.push({id:state.tokens.length+1,user_id:a,token_hash:b,expires_at:Date.now()+c*60000,used_at:null});
  else if(sql.startsWith('INSERT INTO email_verification_deliveries')) state.deliveries.push({user_id:a,time:Date.now()});
  else if(sql.startsWith('INSERT INTO email_verification_sources')) state.sources[a] ||= {attempts:0,reset:false};
  else if(sql.startsWith('SELECT *, window_start')) rows=[state.sources[a]];
  else if(sql.startsWith('UPDATE email_verification_sources')) state.sources[a].attempts++;
  else if(sql.startsWith('SELECT count(*)')) { const ts=state.deliveries.filter(t=>t.user_id===a && t.time>Date.now()-3600000); rows=[{count:ts.length,wait:ts.length?(Math.max(...ts.map(t=>t.time))+60000-Date.now())/1000:0}]; }
  else if(sql.includes('FROM email_verification_tokens')) rows=state.tokens.filter(t=>t.token_hash===a).map(t=>({...t,expired:t.expires_at<=Date.now()}));
  else if(sql.startsWith('UPDATE email_verification_tokens')) state.tokens.find(t=>t.id===a).used_at=new Date();
  else if(sql.startsWith('UPDATE users')) {if(failUpdate) throw new Error('controlled write failure');state.users.find(u=>u.id===a).email_verified_at=new Date();}
  else if(sql.includes('FROM users WHERE lower')) rows=state.users.filter(u=>u.email===a);
  else if(sql.startsWith('SELECT * FROM events')) rows=[{id:a,starts_at:'2099-01-01T00:00:00Z'}];
  else if(sql.startsWith('INSERT INTO registrations')) {if(state.registrations.some(x=>x.user_id===a && x.event_id===b)) throw Object.assign(new Error(),{code:'23505'});const registration={id:state.registrations.length+1,user_id:a,event_id:b,status:'registered'};state.registrations.push(registration);rows=[registration];}
  else if(sql.includes('FROM users WHERE id=')) rows=state.users.filter(u=>u.id===a);
  else throw new Error(`Unexpected SQL ${sql}`);
  return {rows,rowCount:rows.length};
 };
 const database={query,async connect(){let release;const old=tail;tail=new Promise(r=>release=r);await old;let snapshot;return {async query(sql,args){if(sql==='BEGIN'){snapshot=structuredClone(state);return {rows:[]};}if(sql==='COMMIT')return {rows:[]};if(sql==='ROLLBACK'){state=snapshot;return {rows:[]};}return query(sql,args);},release};}};
 let mailFails=false;const mails=[];
 const service=createAuthService({database,settings,sendMail:async m=>{if(mailFails)throw new Error('controlled SMTP failure');mails.push(m);}});
 return {service,database,mails,get state(){return state;},set mailFails(v){mailFails=v;},set failUpdate(v){failUpdate=v;},token:()=>mails.at(-1).text.match(/#token=([\w-]+)/)[1]};
}
test('設定缺漏拒絕啟動；精確網域、欄位與公開角色白名單',()=>{
 assert.throws(()=>config({}),/ALLOWED/);
 assert.equal(validate(input,settings).email,'a@campus.example');
 for(const email of ['a@evilcampus.example','a@campus.example.attacker.invalid','a@sub.campus.example','Name <a@campus.example>']) assert.throws(()=>validate({...input,email},settings),{statusCode:400});
 for(const patch of [{name:' '},{password:'short'},{campus_identity:'admin'},{gender:'x'.repeat(21)}]) assert.throws(()=>validate({...input,...patch},settings),{statusCode:400});
 assert.equal(publicUser({...input,id:1,password_hash:'secret'}).password_hash,undefined);
});
test('非同步 scrypt 保留空白、長 Unicode 密碼、不接受未知／空白雜湊',async()=>{
 const p=' 密碼'.repeat(35);const h=await hashPassword(p);assert.notEqual(h,p);assert.equal(await checkPassword(p,h),true);assert.equal(await checkPassword(p.trim(),h),false);assert.equal(await checkPassword(p,''),false);
});
test('註冊持久化白名單、重複 409、真實密碼登入及 /me 即時狀態',async()=>{
 const f=fixture();const out=await f.service.register(input);
 assert.equal(out.data.role,'user');assert.equal(out.data.email_verified,false);assert.equal(out.verification_email.status,'sent');
 assert.equal(out.data.password_hash,undefined);assert.equal(out.token,undefined);assert.equal(f.state.tokens[0].token_hash,digest(f.token()));
 await assert.rejects(f.service.register(input),{statusCode:409});
 await assert.rejects(f.service.login({...input,password:'incorrect'}),{statusCode:401});
 assert.equal((await f.service.login(input)).id,1);await f.service.verify(f.token());assert.equal((await f.service.me(1)).email_verified,true);await assert.rejects(f.service.me(999),{statusCode:401});
});
test('SMTP 部分失敗仍建立帳號；冷卻後可重寄，新信使舊信失效',async()=>{
 const f=fixture();f.mailFails=true;const out=await f.service.register(input);assert.equal(out.verification_email.status,'failed');assert.equal(f.state.users.length,1);
 await assert.rejects(f.service.resend(input.email,'test'),{statusCode:429});
 f.state.deliveries[0].time-=61000;f.mailFails=false;await f.service.resend(input.email,'test');const old=f.token();f.state.deliveries.forEach(d=>d.time-=61000);await f.service.resend(input.email,'test');await assert.rejects(f.service.verify(old),{statusCode:400});await f.service.verify(f.token());
});
test('驗證無效、恰好到期、已使用；同 token 併發至多成功一次',async()=>{
 const f=fixture();await f.service.register(input);await assert.rejects(f.service.verify('bad'),{statusCode:400});f.state.tokens[0].expires_at=Date.now();await assert.rejects(f.service.verify(f.token()),{statusCode:410});f.state.tokens[0].expires_at=Date.now()+60000;
 const results=await Promise.allSettled([f.service.verify(f.token()),f.service.verify(f.token())]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.statusCode,409);
});
test('驗證寫入失敗整筆回滾，不消耗 token、不變更帳號',async()=>{
 const f=fixture();await f.service.register(input);f.failUpdate=true;await assert.rejects(f.service.verify(f.token()));assert.equal(f.state.tokens[0].used_at,null);assert.equal(f.state.users[0].email_verified_at,null);
});
test('重寄不存在／已驗證回泛化結果；SMTP 失敗 503，節流保留 Retry-After',async()=>{
 const f=fixture();await f.service.register(input);assert.deepEqual(await f.service.resend('none@campus.example','ip'),{message:'若帳號需要驗證，系統將寄送驗證信'});
 await assert.rejects(f.service.resend(input.email,'ip'),e=>e.statusCode===429 && e.retryAfter>0);
 f.state.deliveries.forEach(d=>d.time-=61000);f.mailFails=true;await assert.rejects(f.service.resend(input.email,'ip'),{statusCode:503});
});
test('未驗證直接報名交易 403 且沒有 INSERT，DB 故障不假成功',async()=>{
 const calls=[];const db={async connect(){return {async query(sql){calls.push(sql);if(sql.includes('FROM users'))return {rows:[{email_verified_at:null}]};return {rows:[]};},release(){}};}};
 await assert.rejects(registerForEvent(1,1,db),{statusCode:403});assert.equal(calls.some(s=>s.includes('INSERT')),false);assert.ok(calls.includes('ROLLBACK'));assert.equal(calls.includes('COMMIT'),false);
 await assert.rejects(registerForEvent(1,1,{connect:async()=>{throw new Error('offline');}}),/offline/);
});
test('HTTP 契約 register data、login user、裸 /me、狀態碼及靜態隔離',async()=>{
 const f=fixture();const app=require('../index').createApp({authService:f.service});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 const req=async(path,body,token)=>{const res=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,body:await res.json(),retry:res.headers.get('retry-after')};};
 try {
  let out=await req('/api/auth/register',input);assert.equal(out.status,201);assert.equal(out.body.data.role,'user');
  out=await req('/api/auth/login',input);const token=out.body.token;assert.equal(out.status,200);assert.equal(out.body.user.email_verified,false);
  out=await req('/api/users/me',null,token);assert.equal(out.body.email,'a@campus.example');assert.equal(out.body.user,undefined);
  assert.equal((await req('/api/users/me')).status,401);
  out=await req('/api/auth/resend-verification',{email:input.email});assert.equal(out.status,429);assert.ok(Number(out.retry)>0);
  assert.equal((await req('/api/auth/verify-email',{token:'bad'})).status,400);
  for(const path of ['/server/.env','/database/schema.sql','/server/auth-service.js','/server/tests/auth.test.js']) assert.equal((await fetch(base+path)).status,404);
 } finally { await new Promise(r=>server.close(r)); }
});

test('整合 HTTP：未驗證直接報名無寫入，驗證後沿用原 JWT 成功報名',async()=>{
 const f=fixture();const app=require('../index').createApp({authService:f.service,database:f.database});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 const req=async(path,body,token)=>{const res=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,body:await res.json()};};
 try{
  assert.equal((await req('/api/auth/register',input)).status,201);
  const {body:{token}}=await req('/api/auth/login',input);
  assert.equal((await req('/api/events/1/register',{},token)).status,403);assert.equal(f.state.registrations.length,0);
  assert.equal((await req('/api/auth/verify-email',{token:f.token()})).status,200);
  assert.equal((await req('/api/users/me',null,token)).body.email_verified,true);
  assert.equal((await req('/api/events/1/register',{},token)).status,201);assert.equal(f.state.registrations.length,1);
  assert.equal((await req('/api/events/1/register',{},token)).status,409);assert.equal(f.state.registrations.length,1);
 }finally{await new Promise(r=>server.close(r));}
});
