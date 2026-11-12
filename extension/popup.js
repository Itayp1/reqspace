const DEFAULT_ALLOWLIST = [
  'http://localhost:5173',
  'http://localhost:3005',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3005',
];

async function init() {
  // Load allowlist
  const { originAllowlist = DEFAULT_ALLOWLIST } = await chrome.storage.local.get({ originAllowlist: DEFAULT_ALLOWLIST });

  // Load request counter (session-scoped so it resets on browser restart)
  const { reqCount = 0 } = await chrome.storage.session.get({ reqCount: 0 }).catch(() => ({ reqCount: 0 }));

  // Render origin count + list
  document.getElementById('originCount').textContent = originAllowlist.length;
  document.getElementById('reqCount').textContent = reqCount;

  const originsEl = document.getElementById('allowedOrigins');
  originsEl.innerHTML = '';
  if (originAllowlist.length === 0) {
    originsEl.innerHTML = '<span style="font-size:11px;color:#64748b;">No origins allowed yet</span>';
  } else {
    originAllowlist.forEach((origin) => {
      const pill = document.createElement('div');
      pill.className = 'origin-pill';
      pill.textContent = origin;
      pill.title = origin;
      originsEl.appendChild(pill);
    });
  }
}

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
