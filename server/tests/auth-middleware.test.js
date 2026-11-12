const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { authenticateJwt } = require('../auth-middleware');

const secret = 'test-only-secret-with-at-least-32-characters';

function authenticate(authorization) {
  const req = { get() { return authorization; } };
  return new Promise(resolve => {
    authenticateJwt(req, {}, error => resolve({ req, error }));
  });
}

test('JWT sub 會成為後端可信任的登入者編號', async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = secret;

  try {
    const token = jwt.sign({ sub: '7', role: 'user' }, secret, {
      algorithm: 'HS256',
      expiresIn: '5m'
    });
    const result = await authenticate(`Bearer ${token}`);

    assert.equal(result.error, undefined);
    assert.deepEqual(result.req.user, { id: 7, role: 'user' });
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test('缺少 Bearer Token 時回傳 401', async () => {
  const result = await authenticate('');
  assert.equal(result.error.status, 401);
  assert.equal(result.error.message, '請先登入');
});

test('JWT 簽章錯誤時回傳 401', async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = secret;

  try {
    const token = jwt.sign({ sub: '7' }, 'different-secret', { algorithm: 'HS256' });
    const result = await authenticate(`Bearer ${token}`);
    assert.equal(result.error.status, 401);
    assert.equal(result.error.message, '登入憑證無效或已過期');
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});
