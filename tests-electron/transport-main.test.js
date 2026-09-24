// Node's built-in test runner exercises the Electron main-process transport
// handler (transport-main.js) directly, against a throwaway local HTTP
// server — no Electron/Chromium needed. See TODO.md SEC-0.2.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { handleSend } = require('../transport-main');

function startEchoServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (req.url === '/redirect') {
          res.writeHead(302, { Location: '/echo' });
          res.end();
          return;
        }
        if (req.url === '/binary') {
          res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
          res.end(Buffer.from([0, 1, 2, 3, 255]));
          return;
        }
        if (req.url === '/slow') {
          setTimeout(() => { res.writeHead(200); res.end('late'); }, 500);
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'X-Custom-Response-Header': 'yes',
        });
        res.end(JSON.stringify({ method: req.method, url: req.url, headers: req.headers, body }));
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('handleSend performs a real GET and returns status/headers/body', async () => {
  const server = await startEchoServer();
  const port = server.address().port;
  try {
    const result = await handleSend(null, {
      method: 'GET',
      url: `http://127.0.0.1:${port}/echo`,
      headers: { 'X-Test': 'hello' },
      followRedirects: true,
      verifySsl: true,
      timeout: 5000,
      maxResponseBytes: 1024 * 1024,
    });
    assert.equal(result.ok, true);
    assert.equal(result.response.status, 200);
    assert.equal(result.response.isBase64, false);
    const parsed = JSON.parse(result.response.body);
    assert.equal(parsed.headers['x-test'], 'hello');
    assert.equal(result.response.headers['x-custom-response-header'], 'yes');
  } finally {
    server.close();
  }
});

test('handleSend sends a POST body', async () => {
  const server = await startEchoServer();
  const port = server.address().port;
  try {
    const result = await handleSend(null, {
      method: 'POST',
      url: `http://127.0.0.1:${port}/echo`,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hello: 'world' }),
      followRedirects: true,
      verifySsl: true,
      timeout: 5000,
      maxResponseBytes: 1024 * 1024,
    });
    assert.equal(result.ok, true);
    const parsed = JSON.parse(result.response.body);
    assert.equal(parsed.body, JSON.stringify({ hello: 'world' }));
  } finally {
    server.close();
  }
});

test('handleSend follows redirects when asked, and returns final status', async () => {
  const server = await startEchoServer();
  const port = server.address().port;
  try {
    const result = await handleSend(null, {
      method: 'GET',
      url: `http://127.0.0.1:${port}/redirect`,
      headers: {},
      followRedirects: true,
      verifySsl: true,
      timeout: 5000,
      maxResponseBytes: 1024 * 1024,
    });
    assert.equal(result.ok, true);
    assert.equal(result.response.status, 200);
  } finally {
    server.close();
  }
});

test('handleSend base64-encodes binary content types', async () => {
  const server = await startEchoServer();
  const port = server.address().port;
  try {
    const result = await handleSend(null, {
      method: 'GET',
      url: `http://127.0.0.1:${port}/binary`,
      headers: {},
      followRedirects: true,
      verifySsl: true,
      timeout: 5000,
      maxResponseBytes: 1024 * 1024,
    });
    assert.equal(result.ok, true);
    assert.equal(result.response.isBase64, true);
    assert.deepEqual([...Buffer.from(result.response.body, 'base64')], [0, 1, 2, 3, 255]);
  } finally {
    server.close();
  }
});

test('handleSend enforces maxResponseBytes and reports truncated', async () => {
  const server = await startEchoServer();
  const port = server.address().port;
  try {
    const result = await handleSend(null, {
      method: 'GET',
      url: `http://127.0.0.1:${port}/echo`,
      headers: {},
      followRedirects: true,
      verifySsl: true,
      timeout: 5000,
      maxResponseBytes: 5,
    });
    assert.equal(result.ok, true);
    assert.equal(result.response.truncated, true);
    assert.equal(result.response.body.length, 5);
  } finally {
    server.close();
  }
});

test('handleSend times out and reports a TIMEOUT error', async () => {
  const server = await startEchoServer();
  const port = server.address().port;
  try {
    const result = await handleSend(null, {
      method: 'GET',
      url: `http://127.0.0.1:${port}/slow`,
      headers: {},
      followRedirects: true,
      verifySsl: true,
      timeout: 50,
      maxResponseBytes: 1024,
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'TIMEOUT');
  } finally {
    server.close();
  }
});

test('handleSend rejects non-http(s) protocols', async () => {
  const result = await handleSend(null, {
    method: 'GET',
    url: 'file:///etc/passwd',
    headers: {},
    followRedirects: true,
    verifySsl: true,
    timeout: 1000,
    maxResponseBytes: 1024,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'BAD_URL');
});

test('handleSend reports REFUSED for a closed port', async () => {
  // Bind a server, close it, and use its now-free port: guaranteed nothing is
  // listening there, without hitting fetch's blocked-port list (e.g. port 1).
  const probe = await startEchoServer();
  const freePort = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));

  const result = await handleSend(null, {
    method: 'GET',
    url: `http://127.0.0.1:${freePort}`,
    headers: {},
    followRedirects: true,
    verifySsl: true,
    timeout: 2000,
    maxResponseBytes: 1024,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'REFUSED');
});
