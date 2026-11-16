(() => {
  'use strict';
  const auth=window.NtouAuth, session=window.NtouSession;
  const page=document.body.dataset.accountPage;
  const form=document.querySelector('#account-form'), message=document.querySelector('#account-status'), submit=document.querySelector('#account-submit');
  const show=text=>{if(message)message.textContent=text;};
  let verificationToken='';
  if(page==='verify-email') {
    verificationToken=new URLSearchParams(location.hash.slice(1)).get('token') || '';
    history.replaceState(null,'',location.pathname+location.search);
    if(!verificationToken.trim()){show('請重新開啟驗證信連結；本頁未取得驗證碼。');submit.disabled=true;}
  }
  const emailField=document.querySelector('#email');
  if(emailField)emailField.value=new URLSearchParams(location.search).get('email') || '';
  const clearPasswords=()=>document.querySelectorAll('input[type=password]').forEach(x=>x.value='');
  const updateHeader=()=>{
    const user=auth.getUser();
    document.querySelectorAll('[data-guest]').forEach(x=>x.hidden=!!user);
    document.querySelectorAll('[data-member]').forEach(x=>x.hidden=!user);
    document.querySelectorAll('[data-user-name]').forEach(x=>x.textContent=user?.name || '');
    document.querySelectorAll('[data-pending]').forEach(x=>x.hidden=!user || user.email_verified);
    const refreshButton=document.querySelector('#refresh-account');if(refreshButton)refreshButton.hidden=!session.getToken();
    if(!session.getToken())clearPasswords();
  };
  window.addEventListener('ntou:user-change',updateHeader);
  window.addEventListener('ntou:account-error',event=>{show(event.detail);const status=document.querySelector('#home-account-status');if(status)status.textContent=event.detail;});
  window.addEventListener('ntou:session-change',clearPasswords);
  document.querySelectorAll('[data-logout]').forEach(x=>x.addEventListener('click',()=>{session.clear();show('已登出此分頁。');}));
  document.querySelectorAll('[data-refresh-account],#refresh-account').forEach(x=>x.addEventListener('click',async()=>{
    x.disabled=true;await auth.refresh();x.disabled=false;
    if(auth.getUser())show(auth.getUser().email_verified?'目前信箱已完成驗證。':'目前尚未完成驗證，請開啟最新驗證信。');
  }));
  updateHeader();void auth.refresh();
  if(!form)return;
  function validate() {
    const errors=[];
    for(const field of form.querySelectorAll('input,select')) {
      let error='';
      if(['name','email'].includes(field.name))field.value=field.value.trim();
      if(field.name==='email')field.value=field.value.toLowerCase();
      if(!field.value)error='此欄位為必填';
      else if(field.type==='email' && (field.validity.typeMismatch || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field.value)))error='請輸入有效 Email';
      else if(field.maxLength>0 && field.value.length>field.maxLength)error=`上限 ${field.maxLength} 字元`;
      else if(page==='register' && field.type==='password' && field.value.length<8)error='密碼至少 8 字元';
      if(field.name==='confirm' && field.value!==form.elements.password.value)error='確認密碼不一致';
      if(field.name==='campus_identity' && !['student','teacher','staff'].includes(field.value))error='請選擇校園身分';
      field.setAttribute('aria-invalid',String(!!error));document.querySelector(`#${field.id}-error`).textContent=error;
      if(error)errors.push({field,error});
    }
    if(errors.length){show('請修正表單：\n'+errors.map(x=>`${x.field.labels[0].textContent}：${x.error}`).join('\n'));errors[0].field.focus();return false;}return true;
  }
  function retrySeconds(value) {
    if(!value)return 0;
    if(/^\d+$/.test(value))return Math.min(Number(value),86400);
    const time=Date.parse(value);return Number.isFinite(time)?Math.min(86400,Math.max(0,Math.ceil((time-Date.now())/1000))):0;
  }
  let waiting=false;
  function cooldown(value) {
    let seconds=retrySeconds(value);if(!seconds)return;
    waiting=true;submit.disabled=true;
    const end=Date.now()+seconds*1000;
    const tick=()=>{seconds=Math.max(0,Math.ceil((end-Date.now())/1000));submit.textContent=seconds?`請等待 ${seconds} 秒`:'重新寄送';if(!seconds){clearInterval(timer);waiting=false;submit.disabled=false;}};
    const timer=setInterval(tick,1000);tick();
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(submit.disabled || !validate())return;
    const generation=auth.getGeneration();const label=submit.textContent;
    submit.disabled=true;submit.textContent='處理中…';show('處理中，請稍候…');
    let completed=false;
    try {
      if(page==='register') {
        const data=Object.fromEntries(new FormData(form));delete data.confirm;
        const out=await auth.request('/auth/register',{body:data});
        clearPasswords();show(out.verification_email?.status==='failed'?'帳號已建立，驗證信寄送失敗，請稍後重新寄送。':'帳號已建立，待信箱驗證。驗證信已寄出，請檢查收件匣或垃圾郵件。');
        document.querySelector('#resend-link').href='resend-verification.html?email='+encodeURIComponent(data.email);form.hidden=true;completed=true;
      } else if(page==='login') {
        const out=await auth.request('/auth/login',{body:{email:emailField.value,password:form.elements.password.value}});
        if(generation!==auth.getGeneration())return;
        if(typeof out.token!=='string' || !out.user)throw new Error('登入回應格式錯誤，請稍後重試');
        session.setToken(out.token);clearPasswords();
        location.assign(auth.safeReturn(new URLSearchParams(location.search).get('return')));
      } else if(page==='resend-verification') {
        const out=await auth.request('/auth/resend-verification',{body:{email:emailField.value}});
        show(out.message+'。請檢查收件匣／垃圾郵件，優先開啟最新驗證信。');
      } else if(page==='verify-email') {
        const out=await auth.request('/auth/verify-email',{body:{token:verificationToken}});
        verificationToken='';show(out.message+'。請登入或返回原分頁重新確認狀態。');await auth.refresh();completed=true;
      }
    } catch(e) {
      if(page==='login' && generation!==auth.getGeneration())return;
      const states={400:'驗證連結無效，請重新寄送。',410:'驗證連結已過期，請重新寄送。',409:'驗證連結已使用，請登入確認目前驗證狀態。'};
      show(page==='verify-email'?(states[e.status] || e.message+'。若先前請求已成功，重試可能顯示已使用，請登入確認。'):page==='login' && e.status===401?'帳號或密碼錯誤':e.message);
      if(page==='resend-verification' && e.status===429)cooldown(e.retryAfter);
    } finally {
      if(!waiting){submit.textContent=label;submit.disabled=completed;}
    }
  });
})();
