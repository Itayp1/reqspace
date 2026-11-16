const DEFAULT_ALLOWLIST = [
  'http://localhost:5173',
  'http://localhost:3005',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3005',
];

async function getList() {
  const { originAllowlist } = await chrome.storage.local.get({ originAllowlist: DEFAULT_ALLOWLIST });
  return originAllowlist;
}

async function init() {
  const originAllowlist = await getList();

  // Request counter is session-scoped so it resets on browser restart
  const { reqCount = 0 } = await chrome.storage.session.get({ reqCount: 0 }).catch(() => ({ reqCount: 0 }));

  document.getElementById('originCount').textContent = originAllowlist.length;
  document.getElementById('reqCount').textContent = reqCount;

  const originsEl = document.getElementById('allowedOrigins');
  originsEl.replaceChildren();
  if (originAllowlist.length === 0) {
    originsEl.innerHTML = '<span style="font-size:11px;color:#64748b;">No origins allowed yet</span>';
  }
  originAllowlist.forEach((origin) => {
    const pill = document.createElement('div');
    pill.className = 'origin-pill';
    const label = document.createElement('span');
    label.textContent = origin;
    label.title = origin;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `Remove ${origin}`);
    remove.addEventListener('click', async () => {
      await chrome.storage.local.set({ originAllowlist: (await getList()).filter((o) => o !== origin) });
      init();
    });
    pill.append(label, remove);
    originsEl.appendChild(pill);
  });
}

document.getElementById('originForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('originInput');
  const errEl = document.getElementById('originError');
  let origin;
  try {
    const url = new URL(input.value.trim());
    if (!/^https?:$/.test(url.protocol)) throw new Error();
    origin = url.origin;
  } catch {
    errEl.textContent = 'Enter a full address, e.g. https://host:port';
    return;
  }
  errEl.textContent = '';
  const list = await getList();
  if (!list.includes(origin)) await chrome.storage.local.set({ originAllowlist: [...list, origin] });
  input.value = '';
  init();
});

// ── Test button ───────────────────────────────────────────────────────────────
document.getElementById('testBtn').addEventListener('click', async () => {
  const resultEl = document.getElementById('testResult');
  resultEl.style.color = '#a5b4fc';
  resultEl.textContent = 'Testing…';

  try {
    // Try to fetch a well-known CORS-restricted endpoint directly
    const start = Date.now();
    const res = await fetch('https://httpbin.org/get', { method: 'GET' });
    const ms = Date.now() - start;
    if (res.ok) {
      resultEl.style.color = '#22c55e';
      resultEl.textContent = `✓ Reachable — ${ms}ms`;
    } else {
      resultEl.style.color = '#f59e0b';
      resultEl.textContent = `⚠ HTTP ${res.status}`;
    }
  } catch (e) {
    resultEl.style.color = '#ef4444';
    resultEl.textContent = `✗ ${e.message}`;
  }
});

// ── Options button ────────────────────────────────────────────────────────────
document.getElementById('optionsBtn').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

init();
