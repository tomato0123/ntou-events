import { openDatabase, seedDatabase } from '../src/database.js';

const db = openDatabase(process.env.DATABASE_PATH || './data/events.sqlite');
try {
  const added = seedDatabase(db);
  console.log(`已新增 ${added} 筆示範活動。既有活動與報名資料保持不變。`);
  console.log('活動 ID：ocean-workshop、career-talk、coastal-walk');
} finally { db.close(); }
