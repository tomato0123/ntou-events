const nodemailer = require('nodemailer');
function createMailer(env=process.env) {
  const transport=nodemailer.createTransport({host:env.SMTP_HOST,port:Number(env.SMTP_PORT),secure:env.SMTP_SECURE==='true',auth:env.SMTP_USER?{user:env.SMTP_USER,pass:env.SMTP_PASS}:undefined,connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000});
  return message=>transport.sendMail({...message,from:env.MAIL_FROM});
}
module.exports={createMailer};
