const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
process.env.JWT_SECRET ||= require('node:crypto').randomBytes(32).toString('hex');
delete process.env.USE_MOCK_DB;
const {fixture}=require('./helpers/auth-fixture');
const {createApp}=require('../index');
const root=path.join(__dirname,'../..');
async function httpFixture(t) {
 const f=fixture();const server=createApp({authService:f.service,database:f.database}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const base=`http://127.0.0.1:${server.address().port}`;
 const request=async(url,body,token)=>{const res=await fetch(base+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,body:await res.json(),cache:res.headers.get('cache-control')};};
 return {...f,source:f,base,request};
}
test('同一 app：帳號驗證、原 JWT 報名、真實密碼登入後的歸屬／撤權（SQL adapter）',async t=>{
 const {source:f,request:req}=await httpFixture(t);
 const input={name:'整合測試',email:'member@campus.example',password:'test password',campus_identity:'student',role:'admin'};
 assert.equal((await req('/api/auth/register',input)).body.data.role,'user');const verification=f.token();
 const token=(await req('/api/auth/login',input)).body.token;assert.ok(token);
 assert.equal((await req('/api/events/101/register',{},token)).status,403);assert.equal(f.state.registrations.length,0);
 assert.equal((await req('/api/auth/verify-email',{token:verification})).status,200);
 assert.equal((await req('/api/users/me',null,token)).body.email_verified,true);
 assert.equal((await req('/api/events/101/register',{},token)).status,201);
 assert.equal((await req('/api/events/101/register',{},token)).status,409);assert.equal(f.state.registrations.length,1);
 const accounts={};
 for(const [label,role] of [['owner','event_manager'],['other','event_manager'],['admin','admin']]){
  const data={...input,email:label+'@campus.example'};
  const created=await req('/api/auth/register',data);const id=created.body.data.id;
  f.state.users.find(u=>u.id===id).role=role; // 專用 fixture 設權，公開註冊永遠不能設權。
  accounts[label]={id,token:(await req('/api/auth/login',data)).body.token};
 }
 f.state.events.push(...[[101,accounts.owner.id],[102,accounts.other.id],[103,null]].map(([id,manager_id])=>({id,manager_id,title:'測試活動',location:'測試室',starts_at:'2099-01-01T00:00:00Z',ends_at:'2099-01-01T01:00:00Z'})));
 for(const [label,ids] of [['owner',[101]],['other',[102]],['admin',[101,102,103]]]){
  const out=await req('/api/manage/events',null,accounts[label].token);assert.equal(out.status,200);assert.deepEqual(out.body.data.map(e=>e.id),ids);assert.equal(out.cache,'no-store');
 }
 assert.equal((await req('/api/events/101/registrations',null,accounts.owner.token)).status,200);
 assert.equal((await req('/api/events/102/registrations',null,accounts.owner.token)).status,403);
 assert.equal((await req('/api/events/103/registrations',null,accounts.owner.token)).status,403);
 for(const id of [101,102,103])assert.equal((await req(`/api/events/${id}/registrations`,null,accounts.admin.token)).status,200);
 assert.equal((await req('/api/events/101/registrations',null,token)).status,403);
 assert.equal((await req('/api/events/101/registrations')).status,401);
 f.state.users.find(u=>u.id===accounts.owner.id).role='user';
 assert.equal((await req('/api/manage/events',null,accounts.owner.token)).status,403);
 assert.equal((await req('/api/events/101/registrations',null,accounts.owner.token)).status,403);
});
test('同源自訂 PORT：首頁、帳號、管理資源及雙 API 名稱一致；私密檔案不可讀',async t=>{
 const {base}=await httpFixture(t);
 for(const file of ['index.html','login.html','register.html','verify-email.html','resend-verification.html','manager.html']){
  const res=await fetch(base+'/'+file);assert.equal(res.status,200,file);const html=await res.text();
  for(const [,asset] of html.matchAll(/(?:src|href)="([^"#?]+\.(?:js|css))"/g))assert.equal((await fetch(base+'/'+asset)).status,200,asset);
 }
 const code=await (await fetch(base+'/api-config.js')).text();
 for(const location of [{hostname:'127.0.0.1',port:'9234',protocol:'http:'},{hostname:'example.test',port:'9443',protocol:'https:'}]){
  const ctx={window:{},location};vm.runInNewContext(code,ctx);assert.equal(ctx.window.NtouConfig.apiBase,'/api');assert.equal(ctx.window.NTOU_API_BASE,'/api');
 }
 for(const file of ['/server/.env','/.env','/.git/config','/package.json','/database/schema.sql','/server/index.js','/server/tests/auth.test.js','/tests/ui03.test.js','/__test__/session'])assert.equal((await fetch(base+file)).status,404,file);
});
test('獨立前端 fallback 與可信自訂 API 設定，舊新名稱相容',()=>{
 const code=fs.readFileSync(path.join(root,'api-config.js'),'utf8');
 for(const [location,initial,expected] of [
  [{hostname:'localhost',port:'5500',protocol:'http:'},undefined,'http://127.0.0.1:8000/api'],
  [{hostname:'example.test',port:'9443',protocol:'https:'},undefined,'/api'],
  [{hostname:'localhost',port:'5500',protocol:'http:'},{apiBase:'http://127.0.0.1:9000/api'},'http://127.0.0.1:9000/api']
 ]){const ctx={window:{NtouConfig:initial},location};vm.runInNewContext(code,ctx);assert.equal(ctx.window.NtouConfig.apiBase,expected);assert.equal(ctx.window.NTOU_API_BASE,expected);}
});
test('server 安裝目錄包含全部正式直接依賴（包含 nodemailer），不依賴根目錄安裝',()=>{
 const server=path.join(__dirname,'..');const deps=require('../package.json').dependencies;
 for(const dependency of Object.keys(deps))assert.ok(require.resolve(dependency,{paths:[server]}).startsWith(path.join(server,'node_modules')),dependency);
});

test('實際 CLI 啟動：server 安裝、測試 env-file、自訂 PORT 與 health/config（不連 DB/SMTP）', {timeout:15000},async()=>{
 const {spawn}=require('node:child_process');const os=require('node:os');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ntou-start-'));const envFile=path.join(dir,'.env');
 fs.writeFileSync(envFile,'ALLOWED_CAMPUS_EMAIL_DOMAINS=campus.example\nJWT_SECRET=isolated-startup-test-only\nPUBLIC_APP_URL=http://127.0.0.1:8000\nSMTP_HOST=127.0.0.1\nSMTP_PORT=1025\nSMTP_SECURE=false\nMAIL_FROM=test@campus.example\n');
 const child=spawn(process.execPath,['--env-file='+envFile,'index.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:'0',HOST:'127.0.0.1'},windowsHide:true,stdio:['ignore','pipe','pipe']});
 let output='';let errorOutput='';child.stdout.on('data',b=>output+=b.toString());child.stderr.on('data',b=>errorOutput+=b.toString());
 try{
  const deadline=Date.now()+8000;while(!output.includes('http://') && child.exitCode===null && Date.now()<deadline)await new Promise(r=>setTimeout(r,30));
  const match=output.match(/http:\/\/127\.0\.0\.1:(\d+)/);assert.ok(match,'CLI 未成功啟動：'+errorOutput);
  const base=match[0];assert.equal((await fetch(base+'/api/health')).status,200);
  const code=await (await fetch(base+'/api-config.js')).text();const context={window:{},location:new URL(base)};vm.runInNewContext(code,context);assert.equal(context.window.NtouConfig.apiBase,'/api');
 }finally{if(child.exitCode===null){child.kill();await new Promise(resolve=>child.once('exit',resolve));}fs.unlinkSync(envFile);fs.rmdirSync(dir);}
});
