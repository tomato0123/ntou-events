const {test}=require('node:test');
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {JSDOM}=require('jsdom');
test('UI-06 既有 runner：24 個 DOM/mock HTTP 情境', {timeout:30000},async()=>{
 const app=require('../server/tests/ui06-preview');
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 let dom,subject;
 try {
  const html=await (await fetch(base+'/manager.html')).text();
  subject=new JSDOM(html,{url:base+'/manager.html',runScripts:'outside-only',pretendToBeVisual:true});
  subject.window.fetch=(url,options)=>fetch(new URL(url,base),options);
  for(const name of ['api-config.js','auth-session.js','manager.js'])subject.window.eval(await (await fetch(base+'/'+name)).text());
  dom=new JSDOM('<title>UI-06 前端驗收</title><pre id="results"></pre><iframe id="subject"></iframe>',{url:base+'/__test__/runner',runScripts:'outside-only',pretendToBeVisual:true});
  dom.window.fetch=(url,options)=>fetch(new URL(url,base),options);
  const frame=dom.window.document.getElementById('subject');
  // jsdom 沒有真實瀏覽器的分頁網路；接入獨立 DOM，但執行原有 runner 與正式 manager.js。
  Object.defineProperty(frame,'contentWindow',{get:()=>subject.window});Object.defineProperty(frame,'contentDocument',{get:()=>subject.window.document});
  dom.window.eval(fs.readFileSync(path.join(__dirname,'../server/tests/ui06-runner.js'),'utf8'));
  const deadline=Date.now()+25000;
  while(!/^(PASS|FAIL)/.test(dom.window.document.title) && Date.now()<deadline)await new Promise(r=>setTimeout(r,50));
  const result=dom.window.document.getElementById('results').textContent;
  assert.equal(dom.window.document.title,'PASS UI-06 前端驗收',result);
  assert.match(result,/24 項通過，0 項失敗/);
 }finally{subject?.window.close();dom?.window.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
