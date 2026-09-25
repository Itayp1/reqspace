const DEFAULT_ALLOWLIST = ['http://localhost:5173', 'http://localhost:3005', 'http://127.0.0.1:5173', 'http://127.0.0.1:3005'];

async function load() {
  const result = await chrome.storage.local.get({ originAllowlist: DEFAULT_ALLOWLIST });
  const list = document.getElementById('list');
  list.innerHTML = '';
  result.originAllowlist.forEach(origin => {
    const li = document.createElement('li');
    li.textContent = origin;
    const btn = document.createElement('button');
    btn.textContent = 'Remove';
    btn.onclick = () => removeOrigin(origin);
    li.appendChild(btn);
    list.appendChild(li);
  });
}

async function addOrigin() {
  const input = document.getElementById('newOrigin');
  let origin = input.value.trim();
  if (!origin) return;
  // Ensure no trailing slash
  if (origin.endsWith('/')) origin = origin.slice(0, -1);
  
  const result = await chrome.storage.local.get({ originAllowlist: DEFAULT_ALLOWLIST });
  if (!result.originAllowlist.includes(origin)) {
    const newList = [...result.originAllowlist, origin];
    await chrome.storage.local.set({ originAllowlist: newList });
  }
  input.value = '';
  load();
}

async function removeOrigin(origin) {
  const result = await chrome.storage.local.get({ originAllowlist: DEFAULT_ALLOWLIST });
  const newList = result.originAllowlist.filter(o => o !== origin);
  await chrome.storage.local.set({ originAllowlist: newList });
  load();
}

document.getElementById('addBtn').addEventListener('click', addOrigin);
document.addEventListener('DOMContentLoaded', load);
