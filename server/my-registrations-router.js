const express = require('express');

// No browser-supplied user id is accepted. Replace this middleware with verified
// session authentication when UI-03 is available.
function localIdentity(env) {
  const enabled = env.UI04_LOCAL_TEST === 'true';
  const userId = Number(env.UI04_TEST_USER_ID);
  if (enabled && (env.NODE_ENV !== 'development' || !Number.isSafeInteger(userId) || userId <= 0)) {
    throw new Error('本機測試模式需要 NODE_ENV=development 及有效的 UI04_TEST_USER_ID');
  }
  return (req, res, next) => {
    const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    const localHost = /^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i.test(req.get('host') || '');
    if (!enabled || !loopback || !localHost) return res.status(401).json({ message: '請先登入後查看個人活動。' });
    req.currentUserId = userId;
    next();
  };
}

function createMyRegistrationsRouter(service, env = process.env) {
  const router = express.Router();
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(localIdentity(env));
  // JSON + custom header and same-origin checks prevent cross-site cancellation.
  router.use((req, res, next) => {
    if (req.method === 'GET') return next();
    const origin = req.get('origin');
    if ((origin && origin !== `${req.protocol}://${req.get('host')}`) ||
        req.get('sec-fetch-site') === 'cross-site' ||
        req.get('x-ui04-request') !== '1' || !req.is('application/json')) {
      return res.status(403).json({ message: '請從本站操作取消報名。' });
    }
    next();
  });
  router.get('/', async (req, res, next) => {
    try {
      const result = await service.getMyRegistrations(req.currentUserId);
      res.json({ ...result, meta: { localTest: true, userId: req.currentUserId } });
    } catch (error) { next(error); }
  });
  router.post('/:id/cancel', async (req, res, next) => {
    if (!/^[1-9]\d*$/.test(req.params.id) || !Number.isSafeInteger(Number(req.params.id))) {
      return res.status(400).json({ message: '報名紀錄編號不正確。' });
    }
    try {
      res.json(await service.cancelMyRegistration(req.currentUserId, Number(req.params.id)));
    } catch (error) { next(error); }
  });
  router.use((error, req, res, next) => {
    const messages = {
      NOT_FOUND: [404, '找不到這筆本人的報名紀錄。'],
      STARTED: [409, '活動已開始，無法取消報名。']
    };
    const [status, message] = messages[error.code] || [500, '暫時無法處理，請稍後重試。'];
    res.status(status).json({ message });
  });
  return router;
}

module.exports = { createMyRegistrationsRouter, localIdentity };
