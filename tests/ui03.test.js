const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..');
const tick=()=>new Promise(r=>setTimeout(r,15));
const user={id:1,name:'<img src=x onerror=alert(1)>',email:'a@campus.example',email_verified:false,role:'user'};
function response(status,body,headers={}){return {status,ok:status>=200 && status<300,headers:{get:k=>headers[k] || null},json:async()=>body};}
async function page(name,handler,{url,token}={}){
 const dom=new JSDOM(fs.readFileSync(path.join(root,name+'.html'),'utf8'),{url:url || `http://localhost:8000/${name}.html`,runScripts:'outside-only'});const w=dom.window;
 w.fetch=handler; if(token)w.sessionStorage.setItem('ntou.auth.token',token);
 for(const script of ['api-config.js','auth-session.js','auth-client.js','account.js'])w.eval(fs.readFileSync(path.join(root,script),'utf8'));
 await tick();return {dom,w,doc:w.document,close:()=>w.close()};
}
function fill(p,data){for(const [key,value] of Object.entries(data))p.doc.getElementById(key).value=value;}
function submit(p){p.doc.querySelector('form#account-form').dispatchEvent(new p.w.Event('submit',{bubbles:true,cancelable:true}));}
test('F01 欄位／摘要、第一個錯誤焦點、確認密碼不符不送出',async()=>{
 let calls=0;const p=await page('register',async()=>{calls++;return response(201,{});});try{
 submit(p);await tick();assert.equal(calls,0);assert.equal(p.doc.activeElement.id,'name');assert.equal(p.doc.getElementById('name').getAttribute('aria-invalid'),'true');
 fill(p,{name:'同學',email:'a@campus.example',password:'password',confirm:'different',campus_identity:'student'});submit(p);assert.match(p.doc.getElementById('account-status').textContent,/不一致/);assert.equal(calls,0);
 }finally{p.close();}
});
for(const status of ['sent','failed'])test(`F03/F04 註冊 201 ${status} 不誤認已驗證，清密碼並提供重寄`,async()=>{
 let sent;const p=await page('register',async(_url,options)=>{sent=JSON.parse(options.body);return response(201,{data:user,verification_email:{status}});});try{
 fill(p,{name:' 同學 ',email:' A@campus.example ',password:' password ',confirm:' password ',campus_identity:'teacher'});submit(p);await tick();
 assert.equal(sent.email,'a@campus.example');assert.equal(sent.password,' password ');assert.equal(sent.confirm,undefined);assert.equal(p.doc.getElementById('password').value,'');assert.equal(p.doc.getElementById('account-form').hidden,true);assert.match(p.doc.getElementById('account-status').textContent,status==='failed'?/帳號已建立.*寄送失敗/:/待信箱驗證/);assert.match(p.doc.getElementById('resend-link').href,/email=a%40campus.example/);
 }finally{p.close();}
});
test('F02 後端網域拒絕原文安全呈現，可再次送出',async()=>{
 const p=await page('register',async()=>response(400,{error:'<script>未允許的網域</script>'}));try{
 fill(p,{name:'同學',email:'a@campus.example',password:'password',confirm:'password',campus_identity:'student'});submit(p);await tick();assert.equal(p.doc.querySelector('#account-status script'),null);assert.match(p.doc.querySelector('#account-status').textContent,/未允許/);assert.equal(p.doc.getElementById('account-submit').disabled,false);
 }finally{p.close();}
});
test('F05 重寄 202、429 秒數／無效值、503 與斷線均恢復正確狀態',async()=>{
 for(const scenario of ['202','429','429-invalid','503','offline']){
 const p=await page('resend-verification',async()=>{if(scenario==='offline')throw new Error();return response(parseInt(scenario),{message:'若帳號需要驗證，系統將寄送驗證信',error:'請稍後重試'},{'Retry-After':scenario==='429'?'1':scenario==='429-invalid'?'bad':null});});try{
 fill(p,{email:'a@campus.example'});submit(p);await tick();
 if(scenario==='429'){assert.equal(p.doc.getElementById('account-submit').disabled,true);await new Promise(r=>setTimeout(r,1100));}
 assert.equal(p.doc.getElementById('account-submit').disabled,false);assert.equal(p.doc.getElementById('email').value,'a@campus.example');
 }finally{p.close();}}
});
test('F06 驗證 token 只在記憶體，清 URL；使用者確認後才 POST，不自動登入',async()=>{
 let calls=0,body;const p=await page('verify-email',async(_url,options)=>{calls++;body=JSON.parse(options.body);return response(200,{message:'信箱驗證成功'});},{url:'http://localhost:8000/verify-email.html#token=opaque-token'});try{
 assert.equal(calls,0);assert.equal(p.w.location.hash,'');assert.equal(p.w.sessionStorage.length,0);submit(p);await tick();assert.equal(body.token,'opaque-token');assert.equal(calls,1);assert.match(p.doc.getElementById('account-status').textContent,/信箱驗證成功/);assert.equal(p.w.NtouSession.getToken(),'');
 }finally{p.close();}
});
test('F07 缺碼、400、410、409 分別顯示，不把已使用畫成驗證成功',async()=>{
 for(const [status,text] of [[400,'無效'],[410,'過期'],[409,'已使用']]){
 const p=await page('verify-email',async()=>response(status,{error:'safe error'}),{url:'http://localhost:8000/verify-email.html#token=test'});try{submit(p);await tick();assert.match(p.doc.getElementById('account-status').textContent,new RegExp(text));assert.doesNotMatch(p.doc.getElementById('account-status').textContent,/驗證成功/);}finally{p.close();}}
 const p=await page('verify-email',async()=>{throw new Error('不應呼叫');});assert.match(p.doc.getElementById('account-status').textContent,/重新開啟/);assert.equal(p.doc.getElementById('account-submit').disabled,true);p.close();
});
test('F08 登入 401、503、無效 JSON 與斷線分流且可重試',async()=>{
 for(const scenario of [401,503,'json','offline']){
 const p=await page('login',async()=>{if(scenario==='offline')throw new Error();if(scenario==='json')return {status:502,ok:false,json:async()=>{throw new Error();}};return response(scenario,{error:scenario===401?'帳號或密碼錯誤':'服務暫時無法使用'});});try{
 fill(p,{email:'a@campus.example',password:'password'});submit(p);await tick();const text=p.doc.getElementById('account-status').textContent;
 if(scenario===401)assert.match(text,/帳號或密碼錯誤/);else assert.doesNotMatch(text,/帳號或密碼錯誤/);assert.equal(p.doc.getElementById('account-submit').disabled,false);
 }finally{p.close();}}
});
test('F09/F10/F11/F17 共用 token 還原裸 User，焦點返回重新查詢，姓名安全渲染',async()=>{
 let verified=false;const p=await page('index',async(url,options)=>{assert.equal(options.headers.Authorization,'Bearer real-token');assert.match(url,/users\/me$/);return response(200,{...user,email_verified:verified});},{token:'real-token'});try{
 assert.equal(p.w.NtouAuth.getUser().email_verified,false);assert.equal(p.doc.querySelector('[data-pending]').hidden,false);assert.equal(p.doc.querySelector('[data-user-name] img'),null);
 verified=true;p.w.dispatchEvent(new p.w.Event('focus'));await tick();assert.equal(p.doc.querySelector('[data-pending]').hidden,true);assert.equal(p.w.sessionStorage.getItem('ntou.auth.token'),'real-token');
 }finally{p.close();}
});
test('F12 登出後晚到 login／me 不可恢復身分或 token',async()=>{
 let finish;const pending=new Promise(r=>finish=r);const p=await page('login',async()=>pending);try{
 fill(p,{email:'a@campus.example',password:'password'});submit(p);p.w.NtouSession.clear();finish(response(200,{token:'late-token',user}));await tick();assert.equal(p.w.NtouSession.getToken(),'');
 }finally{p.close();}
 let done;const p2=await page('index',async()=>new Promise(r=>done=r),{token:'old-token'});try{p2.w.NtouSession.clear();done(response(200,user));await tick();assert.equal(p2.w.NtouAuth.getUser(),null);assert.equal(p2.w.NtouSession.getToken(),'');}finally{p2.close();}
});
test('F13 /me 401 清憑證，403/503 保留憑證；不信舊快取',async()=>{
 for(const status of [401,403,503]){const p=await page('index',async()=>response(status,{error:'safe error'}),{token:'token'});try{assert.equal(p.w.NtouSession.getToken(),status===401?'':'token');assert.equal(p.w.NtouAuth.getUser(),null);}finally{p.close();}}
});
test('F16 return path 拒絕外站、反斜線、多層編碼與控制字元',async()=>{
 const p=await page('login',async()=>response(200,user));try{
 for(const unsafe of ['https://evil.invalid','//evil.invalid','/\\evil.invalid','/%2fevil.invalid','/%252fevil.invalid','/%255cevil.invalid','/\n/evil.invalid','javascript:alert(1)'])assert.equal(p.w.NtouAuth.safeReturn(unsafe),'/index.html',unsafe);
 assert.equal(p.w.NtouAuth.safeReturn('/manager.html?id=1'),'/manager.html?id=1');
 }finally{p.close();}
});

test('F13/F14 首頁搜尋、詳情與真實報名控制：後端 403 保留登入',async()=>{
 const event={id:7,title:'測試活動',description:'活動說明',location:'測試場地',starts_at:'2099-01-01T10:00:00Z',ends_at:'2099-01-01T12:00:00Z'};
 let registrations=0;
 const p=await page('index',async(url,options)=>{
  url=String(url); if(url.endsWith('/users/me'))return response(200,{...user,email_verified:true});
  if(url.includes('/events/7/register')){registrations++;assert.equal(options.headers.Authorization,'Bearer token');return response(403,{error:'請先完成校園 Email 驗證'});}
  if(url.endsWith('/events/7'))return response(200,event);
  if(url.includes('/events'))return response(200,{data:[event]});
  throw new Error(url);
 },{token:'token'});
 try{
  const dialog=p.doc.querySelector('dialog');dialog.showModal=()=>dialog.open=true;dialog.close=()=>dialog.open=false;
  p.w.eval(fs.readFileSync(path.join(root,'app.js'),'utf8'));await tick();
  assert.match(p.doc.querySelector('#event-grid').textContent,/測試活動/);
  p.doc.querySelector('#search').value='測試';p.doc.querySelector('#search-form').dispatchEvent(new p.w.Event('submit',{cancelable:true}));await tick();assert.match(p.w.location.search,/q=/);
  p.doc.querySelector('.details-button').click();await tick();assert.equal(dialog.open,true);assert.equal(p.doc.querySelector('#dialog-title').textContent,'測試活動');
  p.doc.querySelector('#dialog-body button').click();await tick();await tick();assert.equal(registrations,1);assert.equal(p.w.NtouSession.getToken(),'token');assert.match(p.doc.querySelector('#dialog-body').textContent,/重新寄送驗證信/);
 }finally{p.close();}
});
