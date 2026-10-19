const express = require('express');

const app = express();

app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ message: '後端運作正常' });
});

app.listen(8000, '127.0.0.1', () => {
  console.log('後端已啟動：http://127.0.0.1:8000');
});