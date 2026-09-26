const DEFAULT_ALLOWLIST = ['http://localhost:5173', 'http://localhost:3005', 'http://127.0.0.1:5173', 'http://127.0.0.1:3005'];

async function getAllowlist() {
  const result = await chrome.storage.local.get({ originAllowlist: DEFAULT_ALLOWLIST });
  return result.originAllowlist;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SEND_REQUEST') {
    handleRequest(message.payload, sender.origin).then(sendResponse);
    return true; // async
  }
});

let nextRuleId = 1;

async function handleRequest(payload, origin) {
  const allowlist = await getAllowlist();
  if (!allowlist.includes(origin)) {
    return { error: `Origin ${origin} is not in the extension allowlist. Please add it in the extension options.` };
  }

  const { method, url, headers, body } = payload;
  
  const forbiddenKeys = ['origin', 'referer', 'cookie', 'host', 'user-agent'];
  const requestHeaders = [];
  const fetchHeaders = new Headers();
  
  for (const [key, value] of Object.entries(headers || {})) {
    if (forbiddenKeys.includes(key.toLowerCase())) {
      requestHeaders.push({ header: key, operation: 'set', value: value });
    } else {
      fetchHeaders.append(key, value);
    }
  }

  let ruleId = null;
  if (requestHeaders.length > 0) {
    ruleId = nextRuleId++;
    await chrome.declarativeNetRequest.updateSessionRules({
      addRules: [{
        id: ruleId,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: requestHeaders
        },
        condition: {
          urlFilter: url,
          tabIds: [-1] // Target background script requests
        }
      }]
    });
  }

  try {
    // Increment session request counter (shown in popup)
    chrome.storage.session.get({ reqCount: 0 }).then(({ reqCount }) => {
      chrome.storage.session.set({ reqCount: (reqCount || 0) + 1 });
    }).catch(() => {});

    const init = {
      method: method || 'GET',
      headers: fetchHeaders,
      credentials: 'omit' // 0.7.4
    };
    if (body && method !== 'GET' && method !== 'HEAD') {
      init.body = body;
    }
    
    const startTime = Date.now();
    const res = await fetch(url, init);
    const time = Date.now() - startTime;
    
    const responseHeaders = {};
    for (const [key, value] of res.headers.entries()) {
      responseHeaders[key] = value;
    }
    
    const responseBody = await res.text();
    return {
      status: res.status,
      statusText: res.statusText,
      headers: responseHeaders,
      body: responseBody,
      time
    };
  } catch (e) {
    return { error: e.message };
  } finally {
    if (ruleId !== null) {
      await chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: [ruleId]
      });
    }
  }
}
