const {
  getMyRegistrations,
  closeDatabase
} = require('./registration-service');

async function test() {
  try {
    // 僅供本機測試，正式 API 改用驗證後的登入者編號。
    const result = await getMyRegistrations(1);

    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('查詢失敗：', error.message);
    process.exitCode = 1;
  } finally {
    await closeDatabase();
  }
}

test();