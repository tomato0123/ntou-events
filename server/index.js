const express = require('express');
const path = require('node:path');
const { createMyRegistrationsRouter } = require('./my-registrations-router');
const registrations = require('./registration-service');

const app = express();

app.use(express.json());
app.use('/api/users/me/registrations', createMyRegistrationsRouter(registrations));

// Serve only public frontend files, never the repository or .env files.
for (const file of ['index.html', 'styles.css', 'app.js', 'app_new.js', 'my-activities.html', 'my-activities.js', 'my-activities.css']) {
  app.get(`/${file}`, (req, res) => res.sendFile(path.join(__dirname, '..', file)));
}
app.get('/', (req, res) => res.redirect('/index.html'));

app.get('/api/health', (req, res) => {
  res.json({ message: '後端運作正常' });
});

app.listen(8000, '127.0.0.1', () => {
  console.log('後端已啟動：http://127.0.0.1:8000');
});
