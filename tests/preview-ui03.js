// 隔離預覽：不讀 .env、不連 DB、不寄真信；正式伺服器不公開此檔案。
const express=require('express');const path=require('node:path');const app=express();
const files=['index.html','styles.css','app.js','account.css','account.js','auth-session.js','auth-client.js','login.html','register.html','verify-email.html','resend-verification.html'];
for(const file of files)app.get('/'+file,(_req,res)=>res.sendFile(path.join(__dirname,'..',file)));
app.get('/api-config.js',(_req,res)=>res.type('js').send("window.NTOU_API_BASE='/api';"));
app.get('/api/events',(_req,res)=>res.json({data:[]}));
app.get('/mobile',(_req,res)=>res.send('<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><p>受控預覽：375px viewport</p><iframe title="375px 註冊頁" src="/register.html" width="375" height="1000" style="border:1px solid #888"></iframe>'));
app.use(express.json());
app.post('/api/auth/register',(_req,res)=>res.status(201).json({message:'測試帳號已建立',data:{id:1},verification_email:{status:'sent'}}));
app.post('/api/auth/resend-verification',(_req,res)=>res.status(202).json({message:'若帳號需要驗證，系統將寄送驗證信'}));
app.post('/api/auth/verify-email',(_req,res)=>res.json({message:'信箱驗證成功（mock）'}));
app.listen(8123,'127.0.0.1',()=>console.log('UI-03 mock preview http://127.0.0.1:8123/register.html'));
