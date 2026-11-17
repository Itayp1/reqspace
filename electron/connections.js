// Desktop-only live connections (Kafka, and WebSocket with auth headers / SSL options).
// Browsers can do neither, so they run in the Electron main process. No Electron
// imports: `emit(id, event)` is injected so this can run under plain Node.
const { Kafka, logLevel } = require('kafkajs');
const WebSocket = require('ws');

const sessions = new Map(); // id -> { close(), send(payload), commit?(m) }

const lines = (s) => String(s || '').split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);

function kafkaClient(cfg) {
  const ssl = cfg.ssl
    ? {
        rejectUnauthorized: cfg.rejectUnauthorized !== false,
        ...(cfg.ca ? { ca: [cfg.ca] } : {}),
        ...(cfg.cert ? { cert: cfg.cert } : {}),
        ...(cfg.key ? { key: cfg.key } : {}),
      }
    : false;
  const sasl = cfg.sasl
    ? { mechanism: cfg.mechanism || 'plain', username: cfg.username || '', password: cfg.password || '' }
    : undefined;
  return new Kafka({
    clientId: cfg.clientId || 'reqspace',
    brokers: lines(cfg.brokers),
    ssl,
    sasl,
    logLevel: logLevel.NOTHING,
    connectionTimeout: 8000,
    retry: { retries: 2 },
  });
}

async function kafkaOpen(id, cfg, emit) {
  if (!lines(cfg.brokers).length) throw new Error('Brokers are required (host:port)');
  if (!cfg.topic) throw new Error('Topic is required');
  const kafka = kafkaClient(cfg);
  const consumer = kafka.consumer({ groupId: cfg.groupId || `reqspace-${Date.now().toString(36)}` });
  const producer = kafka.producer();
  const only = Number.isInteger(cfg.partition) ? cfg.partition : null;
  await consumer.connect();
  await producer.connect();
  await consumer.subscribe({ topic: cfg.topic, fromBeginning: !!cfg.fromBeginning });
  // Manual commit mode: the offset moves only when the user marks a message read.
  await consumer.run({
    autoCommit: !cfg.commitOnRead,
    eachMessage: async ({ partition, message }) => {
      if (only !== null && partition !== only) return;
      emit(id, {
        type: 'message',
        partition,
        offset: message.offset,
        key: message.key ? message.key.toString() : null,
        value: message.value ? message.value.toString() : '',
        headers: Object.fromEntries(Object.entries(message.headers || {}).map(([k, v]) => [k, v == null ? '' : v.toString()])),
        timestamp: message.timestamp,
      });
    },
  });
  sessions.set(id, {
    async close() { await consumer.disconnect().catch(() => {}); await producer.disconnect().catch(() => {}); },
    async send({ key, value, headers }) {
      await producer.send({ topic: cfg.topic, messages: [{ key: key || null, value: String(value ?? ''), headers: headers || {} }] });
    },
    async commit({ partition, offset }) {
      await consumer.commitOffsets([{ topic: cfg.topic, partition, offset: String(BigInt(offset) + 1n) }]);
    },
  });
}

/** Topics and consumer groups of the broker, for the pickers. */
async function kafkaList(cfg) {
  if (!lines(cfg.brokers).length) throw new Error('Brokers are required (host:port)');
  const admin = kafkaClient(cfg).admin();
  await admin.connect();
  try {
    const topics = (await admin.listTopics()).filter((t) => !t.startsWith('__')).sort();
    const groups = (await admin.listGroups()).groups.map((g) => g.groupId).sort();
    return { topics, groups };
  } finally {
    await admin.disconnect().catch(() => {});
  }
}

function wsOpen(id, cfg, emit) {
  return new Promise((resolve, reject) => {
    const protocols = lines(cfg.protocols);
    const ws = new WebSocket(cfg.url, protocols.length ? protocols : undefined, {
      headers: cfg.headers || {},
      rejectUnauthorized: cfg.rejectUnauthorized !== false,
    });
    let opened = false;
    ws.on('open', () => {
      opened = true;
      sessions.set(id, { close: () => ws.close(), send: ({ value }) => ws.send(String(value)) });
      resolve(ws.protocol || '');
    });
    ws.on('message', (data) => emit(id, { type: 'message', value: data.toString() }));
    ws.on('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode} ${res.statusMessage || ''}`.trim())));
    ws.on('error', (err) => (opened ? emit(id, { type: 'error', error: err.message }) : reject(err)));
    ws.on('close', () => { sessions.delete(id); if (opened) emit(id, { type: 'closed' }); });
  });
}

async function open(id, kind, cfg, emit) {
  await close(id);
  if (kind === 'kafka') { await kafkaOpen(id, cfg, emit); return ''; }
  if (kind === 'ws') return wsOpen(id, cfg, emit);
  throw new Error(`Unknown connection kind: ${kind}`);
}

async function close(id) {
  const s = sessions.get(id);
  sessions.delete(id);
  if (s) await s.close();
}

async function send(id, payload) {
  const s = sessions.get(id);
  if (!s) throw new Error('Not connected');
  await s.send(payload);
}

async function commit(id, m) {
  const s = sessions.get(id);
  if (!s || !s.commit) throw new Error('Not connected');
  await s.commit(m);
}

module.exports = { open, close, send, commit, kafkaList };
