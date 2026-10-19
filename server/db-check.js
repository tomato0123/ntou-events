const { Pool } = require('pg');

const pool = new Pool({
  connectionTimeoutMillis: 5000
});

async function checkDatabase() {
  try {
    const result = await pool.query(
      'SELECT current_database() AS database'
    );

    console.log('資料庫連線成功：', result.rows[0].database);
  } catch (error) {
    console.error('資料庫連線失敗：', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

checkDatabase();