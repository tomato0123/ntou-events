const {fail}=require('./auth-service');
async function requireVerifiedUser(client,userId) {
 const {rows}=await client.query('SELECT email_verified_at FROM users WHERE id=$1 FOR SHARE',[userId]);
 if(!rows[0]) throw fail(401,'帳號不存在，請重新登入');
 if(!rows[0].email_verified_at) throw fail(403,'請先完成校園 Email 驗證');
}
module.exports={requireVerifiedUser};
