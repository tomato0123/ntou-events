const {createAuthService}=require('../../auth-service');
const settings={domains:['campus.example'],url:'http://127.0.0.1:8000',ttl:1440};
// 受控 SQL adapter，不等同 PostgreSQL：模擬鎖序列、交易回滾及 DB 時間。
function fixture() {
 let state={users:[],tokens:[],deliveries:[],sources:{},registrations:[],events:[]}; let tail=Promise.resolve(); let failUpdate=false;
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
  else if(sql === 'SELECT id, role FROM users WHERE id = $1') rows=state.users.filter(u=>u.id===a);
  else if(sql.includes('FROM events') && sql.includes('ORDER BY starts_at')) rows=state.events.filter(e=>a || e.manager_id===b).sort((x,y)=>x.id-y.id);
  else if(sql.startsWith('SELECT id, title, manager_id FROM events')) rows=state.events.filter(e=>e.id===a);
  else if(sql.includes('LEFT JOIN users')) rows=state.registrations.filter(x=>x.event_id===a && (b==null || x.status===b)).map(x=>{const u=state.users.find(u=>u.id===x.user_id);return {...x,user_name:u.name,user_email:u.email,campus_identity:u.campus_identity,gender:u.gender};});
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

module.exports={fixture};
