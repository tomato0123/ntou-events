(() => {
  'use strict';
  const session=window.NtouSession;
  let generation=0, user=null, refreshId=0;
  const emit=()=>window.dispatchEvent(new Event('ntou:user-change'));
  async function request(path,{body,authenticated=false,signal}={}) {
    const token=authenticated?session.getToken():'';
    let response, data;
    try {
      response=await fetch(`${window.NTOU_API_BASE}${path}`,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal});
    } catch(e) { if(e.name==='AbortError') throw e;throw Object.assign(new Error('網路連線失敗，請稍後重試'),{status:0}); }
    try {data=await response.json();} catch {throw Object.assign(new Error('服務回應格式錯誤，請稍後重試'),{status:response.status});}
    if(!response.ok) throw Object.assign(new Error(typeof data.error==='string'?data.error:'服務暫時無法使用，請稍後重試'),{status:response.status,retryAfter:response.headers.get('Retry-After')});
    return data;
  }
  async function refresh() {
    const current=generation, id=++refreshId;
    if(!session.getToken()){user=null;emit();return;}
    try {const data=await request('/users/me',{authenticated:true});
      if(current!==generation || id!==refreshId)return;
      if(!data || typeof data.id!=='number' || typeof data.email_verified!=='boolean')throw new Error('服務回應格式錯誤，請稍後重試');
      user=data;emit();
    } catch(e) {
      if(current!==generation || id!==refreshId)return;
      if(e.status===401) session.clear();
      else {user=null;emit();window.dispatchEvent(new CustomEvent('ntou:account-error',{detail:e.message}));}
    }
  }
  window.addEventListener('ntou:session-change',()=>{generation++;refreshId++;user=null;emit();void refresh();});
  window.addEventListener('focus',()=>{if(session.getToken())void refresh();});
  function safeReturn(value) {
    if(typeof value!=='string')return '/index.html';
    let decoded=value;
    try {for(let i=0;i<5 && decoded.includes('%');i++){const next=decodeURIComponent(decoded);if(next===decoded)break;decoded=next;}} catch {return '/index.html';}
    if(!decoded.startsWith('/') || decoded.startsWith('//') || /[\\%\u0000-\u0020]/.test(decoded))return '/index.html';
    try {const url=new URL(decoded,location.origin);return url.origin===location.origin?url.pathname+url.search+url.hash:'/index.html';} catch{return '/index.html';}
  }
  window.NtouAuth=Object.freeze({request,refresh,safeReturn,getUser:()=>user,getGeneration:()=>generation});
})();
