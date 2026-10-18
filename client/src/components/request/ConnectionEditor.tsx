import React, { useState, useEffect, useRef } from 'react';
import { useRequestStore, type ConnectionSettings } from '../../store/requestStore';
import { Play, Square, Trash2, Save } from 'lucide-react';
import { SaveRequestModal } from './SaveRequestModal';
import { toRequestPayload } from '../../utils/requestPayload';
import { useToastStore } from '../../store/toastStore';
import api from '../../api/axios';
import { io, Socket } from 'socket.io-client';
import { resolveAllVariables } from '../../utils/variables';

// Names Socket.IO itself emits/uses; emitting or listening to them collides with the client.
const RESERVED_EVENTS = ['connect', 'connect_error', 'disconnect', 'error', 'disconnecting', 'newListener', 'removeListener'];

const INPUT_CLS = 'px-2 py-1 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded';

/**
 * Minimal fetch-based SSE client. The browser's EventSource can't send headers
 * (no Authorization), hides the HTTP status of failures and only exposes named
 * events that were pre-registered, so we parse the stream ourselves. It also
 * honours `retry:` and resends `Last-Event-ID` on reconnect, like EventSource.
 */
async function runSse(opts: {
  url: string;
  headers: Record<string, string>;
  signal: AbortSignal;
  onOpen: () => void;
  onEvent: (ev: { event: string; id: string; data: string }) => void;
  onInfo: (msg: string) => void;
  onFatal: (msg: string) => void;
}) {
  let lastId = '';
  let retry = 3000;
  let attempt = 0;
  while (!opts.signal.aborted) {
    try {
      const headers: Record<string, string> = { Accept: 'text/event-stream', 'Cache-Control': 'no-cache', ...opts.headers };
      if (lastId) headers['Last-Event-ID'] = lastId;
      const res = await fetch(opts.url, { headers, signal: opts.signal });
      if (!res.ok) {
        opts.onFatal(`SSE HTTP ${res.status} ${res.statusText}`.trim());
        return;
      }
      const ct = res.headers.get('content-type') || '';
      if (!ct.toLowerCase().includes('text/event-stream') || !res.body) {
        opts.onFatal(`Not an SSE endpoint: expected Content-Type text/event-stream, got "${ct || 'none'}"`);
        return;
      }
      attempt = 0;
      opts.onOpen();
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let ev = { event: '', id: '', data: [] as string[] };
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.search(/\r\n|\n|\r/)) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(buf[nl] === '\r' && buf[nl + 1] === '\n' ? nl + 2 : nl + 1);
          if (line === '') {
            if (ev.data.length) opts.onEvent({ event: ev.event || 'message', id: ev.id || lastId, data: ev.data.join('\n') });
            ev = { event: '', id: '', data: [] };
            continue;
          }
          if (line.startsWith(':')) continue;
          const c = line.indexOf(':');
          const field = c < 0 ? line : line.slice(0, c);
          let val = c < 0 ? '' : line.slice(c + 1);
          if (val.startsWith(' ')) val = val.slice(1);
          if (field === 'data') ev.data.push(val);
          else if (field === 'event') ev.event = val;
          else if (field === 'id') { ev.id = val; lastId = val; }
          else if (field === 'retry' && /^\d+$/.test(val)) retry = Number(val);
        }
      }
      if (opts.signal.aborted) return;
      opts.onInfo(`SSE stream ended; reconnecting in ${retry}ms${lastId ? ` (Last-Event-ID: ${lastId})` : ''}`);
    } catch (err: any) {
      if (opts.signal.aborted) return;
      attempt++;
      if (attempt > 5) {
        opts.onFatal(`SSE connection failed: ${err?.message || err}`);
        return;
      }
      opts.onInfo(`SSE connection lost (${err?.message || err}); retry ${attempt}/5 in ${retry}ms`);
    }
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, retry);
      opts.signal.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
    });
  }
}

export const ConnectionEditor: React.FC = () => {
  const { activeRequest, updateActiveRequest } = useRequestStore();
  const conn: ConnectionSettings = activeRequest?.connection ?? {};
  const updateConn = (u: Partial<ConnectionSettings>) => updateActiveRequest({ connection: { ...conn, ...u } });
  const headers = activeRequest?.headers ?? [];

  const [messages, setMessages] = useState<{type: 'sent'|'received'|'info'|'error', data: string, time: Date}[]>([]);
  const [newListen, setNewListen] = useState('');
  // The draft message and event name live on the tab so a refresh restores them.
  const inputMsg = activeRequest?.body?.raw ?? '';
  const setInputMsg = (v: string) => updateActiveRequest({ body: { mode: 'raw', raw: v } });
  // Socket.IO is event-based: emitting is always emit(name, payload). Without
  // a name field the editor could only ever call socket.send(), i.e. emit a
  // "message" event, which is the one thing most real servers don't listen for.
  const eventName = conn.eventName ?? 'message';
  const setEventName = (v: string) => updateConn({ eventName: v });
  const [connected, setConnected] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const socketIoRef = useRef<Socket | null>(null);
  const sseAbortRef = useRef<AbortController | null>(null);
  const listenRef = useRef<string[]>([]);
  listenRef.current = conn.listen ?? [];

  const protocol = activeRequest?.method || 'WS';
  const rawUrl = activeRequest?.url || '';
  // {{var}} in the URL / headers / protocols / auth resolves against the active environment.
  const resolve = (t: string) => resolveAllVariables(t, activeRequest?.collectionId);

  const addMsg = (type: 'sent'|'received'|'info'|'error', data: string) => {
    setMessages(prev => [...prev, { type, data, time: new Date() }]);
  };

  const connect = () => {
    if (connected) return;
    const url = resolve(rawUrl);

    if (protocol === 'WS') {
      try {
        const protocols = resolve(conn.wsProtocols || '').split(',').map(p => p.trim()).filter(Boolean);
        const ws = new WebSocket(url, protocols.length ? protocols : undefined);
        ws.onopen = () => {
          setConnected(true);
          addMsg('info', `Connected to WebSocket${ws.protocol ? ` (protocol: ${ws.protocol})` : ''}`);
        };
        ws.onmessage = (e) => addMsg('received', e.data);
        ws.onclose = () => {
          if (wsRef.current === ws) wsRef.current = null;
          setConnected(false);
          addMsg('info', 'WebSocket closed');
        };
        ws.onerror = () => addMsg('error', 'WebSocket error');
        wsRef.current = ws;
      } catch (err: any) {
        addMsg('error', err.message);
      }
    } else if (protocol === 'SOCKETIO') {
      try {
        let auth: Record<string, unknown> | undefined;
        if (conn.sioAuth?.trim()) {
          try {
            auth = JSON.parse(resolve(conn.sioAuth));
          } catch {
            addMsg('error', 'Auth payload is not valid JSON — not connecting');
            return;
          }
        }
        const query: Record<string, string> = {};
        new URLSearchParams(resolve(conn.sioQuery || '').replace(/^\?/, '')).forEach((v, k) => { query[k] = v; });
        // Socket.IO takes an origin plus an optional namespace path, which is
        // exactly what the URL field already holds.
        // Capped reconnection: the default is infinite, and every failed
        // attempt writes a connect_error row, so an unreachable host used to
        // flood the transcript forever.
        const socket = io(url, {
          transports: ['websocket', 'polling'],
          reconnectionAttempts: 3,
          ...(conn.sioPath?.trim() ? { path: resolve(conn.sioPath.trim()) } : {}),
          ...(auth ? { auth } : {}),
          ...(Object.keys(query).length ? { query } : {}),
        });
        socket.on('connect', () => {
          setConnected(true);
          addMsg('info', 'Connected to Socket.IO');
        });
        socket.on('disconnect', (reason) => {
          setConnected(false);
          addMsg('info', `Socket.IO disconnected (${reason})`);
        });
        // A handshake that never completes used to leave the UI on "Connect"
        // with an empty transcript and no clue why.
        socket.on('connect_error', (err: Error) => {
          setConnected(false);
          addMsg('error', `Socket.IO connect error: ${err.message}`);
        });
        // onAny already covers every inbound event, "message" included. An
        // empty listen list means "everything"; otherwise only named events.
        socket.onAny((event, ...args) => {
          if (listenRef.current.length && !listenRef.current.includes(event)) return;
          addMsg('received', `Event [${event}]: ${JSON.stringify(args)}`);
        });
        socketIoRef.current = socket;
      } catch (err: any) {
        addMsg('error', err.message);
      }
    } else if (protocol === 'SSE') {
      const ctrl = new AbortController();
      sseAbortRef.current = ctrl;
      const hdrs: Record<string, string> = {};
      for (const h of headers) if (h.enabled && h.key.trim()) hdrs[h.key.trim()] = resolve(h.value);
      void runSse({
        url,
        headers: hdrs,
        signal: ctrl.signal,
        onOpen: () => { setConnected(true); addMsg('info', 'Connected to SSE'); },
        onEvent: (ev) => addMsg('received', `[${ev.event}]${ev.id ? ` #${ev.id}` : ''} ${ev.data}`),
        onInfo: (m) => addMsg('info', m),
        onFatal: (m) => {
          addMsg('error', m);
          setConnected(false);
          if (sseAbortRef.current === ctrl) sseAbortRef.current = null;
        },
      });
      // Show "Disconnect" straight away so the stream can be cancelled while (re)connecting.
      setConnected(true);
    } else if (protocol === 'KAFKA') {
      // Kafka is a stub: never pretend to be connected.
      addMsg('error', 'Kafka is not implemented (stub) — no connection was made');
    }
  };

  const disconnect = () => {
    // Was there anything to tear down? React's dev-mode double-invoked
    // effects run this cleanup once right after mount, and logging
    // unconditionally made every fresh connection tab open on a bogus
    // "Disconnected" line.
    const hadTransport = !!(wsRef.current || socketIoRef.current || sseAbortRef.current);

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (socketIoRef.current) {
      socketIoRef.current.disconnect();
      socketIoRef.current = null;
    }
    if (sseAbortRef.current) {
      sseAbortRef.current.abort();
      sseAbortRef.current = null;
    }
    setConnected(false);
    if (hadTransport) addMsg('info', 'Disconnected');
  };

  const sendMessage = () => {
    if (!inputMsg) return;

    if (protocol === 'WS' && wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(inputMsg);
        addMsg('sent', inputMsg);
      } else {
        addMsg('error', 'Not connected — message not sent');
      }
    } else if (protocol === 'SOCKETIO' && socketIoRef.current) {
      const name = eventName.trim() || 'message';
      if (RESERVED_EVENTS.includes(name)) {
        addMsg('error', `"${name}" is a reserved Socket.IO event name — pick another`);
        return;
      }
      // A JSON array is the argument list: [1,{"a":2},"x"] -> emit(name, 1, {a:2}, "x").
      // Any other JSON value is a single structured argument; plain text is sent raw.
      let args: any[] = [inputMsg];
      const trimmed = inputMsg.trim();
      try {
        const parsed = JSON.parse(trimmed);
        args = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        if (/^[[{"]/.test(trimmed)) {
          addMsg('error', 'Invalid JSON — message not sent');
          return;
        }
      }
      socketIoRef.current.emit(name, ...args, (...ack: any[]) => {
        addMsg('received', `Ack [${name}]: ${JSON.stringify(ack)}`);
      });
      addMsg('sent', `Event [${name}]: ${JSON.stringify(args)}`);
    } else if (protocol === 'SSE') {
      addMsg('error', 'Cannot send messages over SSE (unidirectional)');
    }
    setInputMsg('');
  };

  useEffect(() => {
    return () => {
      disconnect(); // Cleanup on unmount
    };
  }, []);

  // Save the connection (type, URL, headers, settings, draft message) as a request in the tree.
  const saveConnection = async () => {
    if (!activeRequest) return;
    if (!activeRequest._id || !activeRequest.collectionId) { setSaveOpen(true); return; }
    try {
      const res = await api.put(`/requests/${activeRequest._id}`, { ...toRequestPayload(activeRequest), folderId: activeRequest.folderId ?? null });
      updateActiveRequest({ updatedAt: res.data.updatedAt });
      useRequestStore.getState().markSaved();
      useToastStore.getState().addToast('success', 'Connection saved');
    } catch (err: any) {
      useToastStore.getState().addToast('error', `Save failed: ${err?.response?.data?.message || err?.message || 'unknown error'}`);
    }
  };

  const noSend = !connected || protocol === 'SSE' || protocol === 'KAFKA';

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 overflow-hidden">
      <div className="flex items-center gap-2 p-2 border-b border-gray-200 dark:border-gray-800">
        <select
          data-testid="connection-protocol-select"
          className="px-2 py-1 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-sm"
          value={protocol}
          onChange={(e) => updateActiveRequest({ method: e.target.value })}
        >
          <option value="WS">WebSocket</option>
          <option value="SOCKETIO">Socket.IO</option>
          <option value="SSE">SSE</option>
          <option value="KAFKA">Kafka</option>
        </select>
        <input
          type="text"
          data-testid="connection-url-input"
          className="flex-1 px-3 py-1 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-sm"
          placeholder="Enter connection URL (e.g., ws://localhost:8080)"
          value={rawUrl}
          onChange={(e) => updateActiveRequest({ url: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter') connect(); }}
        />
        {protocol === 'KAFKA' ? null : connected ? (
          <button data-testid="connection-disconnect-btn" onClick={disconnect} className="flex items-center gap-1 px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded text-sm transition-colors">
            <Square size={14} /> Disconnect
          </button>
        ) : (
          <button data-testid="connection-connect-btn" onClick={connect} className="flex items-center gap-1 px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm transition-colors">
            <Play size={14} /> Connect
          </button>
        )}
        <button data-testid="request-save-btn" onClick={saveConnection} title="Save connection to a collection" className="flex items-center gap-1 px-3 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm hover:bg-gray-100 dark:hover:bg-gray-800">
          <Save size={14} /> Save
        </button>
      </div>
      {saveOpen && <SaveRequestModal onClose={() => setSaveOpen(false)} />}

      {protocol === 'KAFKA' && (
        <div data-testid="connection-kafka-stub-banner" className="m-4 mb-0 p-3 rounded border border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200 text-sm">
          Kafka support is currently a stub / mockup and does not connect to real brokers.
        </div>
      )}
      {protocol === 'WS' && (
        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-800 text-xs flex items-center gap-2">
          <input
            data-testid="connection-ws-protocols-input"
            className={`flex-1 ${INPUT_CLS}`}
            placeholder="Sub-protocols (Sec-WebSocket-Protocol), comma separated — supports {{var}}"
            value={conn.wsProtocols ?? ''}
            onChange={(e) => updateConn({ wsProtocols: e.target.value })}
            disabled={connected}
          />
          <span className="opacity-60">Browsers cannot send custom headers on a WebSocket; pass a token via a sub-protocol or the URL.</span>
        </div>
      )}
      {protocol === 'SOCKETIO' && (
        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-800 text-xs flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input data-testid="connection-sio-path-input" className={`w-56 ${INPUT_CLS}`} placeholder="Path (default /socket.io)" value={conn.sioPath ?? ''} onChange={(e) => updateConn({ sioPath: e.target.value })} disabled={connected} />
            <input data-testid="connection-sio-query-input" className={`w-56 ${INPUT_CLS}`} placeholder="Query (a=1&b=2)" value={conn.sioQuery ?? ''} onChange={(e) => updateConn({ sioQuery: e.target.value })} disabled={connected} />
            <input data-testid="connection-sio-auth-input" className={`flex-1 ${INPUT_CLS}`} placeholder='Auth payload JSON, e.g. {"token":"{{token}}"} (not kept after refresh)' value={conn.sioAuth ?? ''} onChange={(e) => updateConn({ sioAuth: e.target.value })} disabled={connected} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="opacity-60">Listen to events (empty = all):</span>
            {(conn.listen ?? []).map((ev) => (
              <span key={ev} data-testid="connection-listen-chip" className="px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">
                {ev} <button aria-label={`Remove ${ev}`} onClick={() => updateConn({ listen: (conn.listen ?? []).filter(x => x !== ev) })}>x</button>
              </span>
            ))}
            <input
              data-testid="connection-listen-input"
              className={`w-44 ${INPUT_CLS}`}
              placeholder="Add event name + Enter"
              value={newListen}
              onChange={(e) => setNewListen(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                const n = newListen.trim();
                if (!n) return;
                if (RESERVED_EVENTS.includes(n)) { addMsg('error', `"${n}" is a reserved Socket.IO event name`); return; }
                if (!(conn.listen ?? []).includes(n)) updateConn({ listen: [...(conn.listen ?? []), n] });
                setNewListen('');
              }}
            />
          </div>
        </div>
      )}
      {protocol === 'SSE' && (
        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-800 text-xs flex flex-col gap-1">
          <span className="opacity-60">Headers (e.g. Authorization). Sent via fetch streaming, because the browser EventSource cannot set headers.</span>
          {headers.map((h, i) => (
            <div key={i} className="flex items-center gap-2">
              <input data-testid="connection-sse-header-key" className={`w-48 ${INPUT_CLS}`} placeholder="Header" value={h.key} onChange={(e) => updateActiveRequest({ headers: headers.map((x, j) => j === i ? { ...x, key: e.target.value } : x) })} disabled={connected} />
              <input data-testid="connection-sse-header-value" className={`flex-1 ${INPUT_CLS}`} placeholder="Value" value={h.value} onChange={(e) => updateActiveRequest({ headers: headers.map((x, j) => j === i ? { ...x, value: e.target.value } : x) })} disabled={connected} />
              <button aria-label="Remove header" onClick={() => updateActiveRequest({ headers: headers.filter((_, j) => j !== i) })} disabled={connected}>x</button>
            </div>
          ))}
          <button data-testid="connection-sse-add-header" className="self-start underline" onClick={() => updateActiveRequest({ headers: [...headers, { key: '', value: '', enabled: true }] })} disabled={connected}>+ Add header</button>
        </div>
      )}

      <div className="flex-1 flex flex-col p-4 overflow-hidden min-h-0">
        <div data-testid="connection-message-log" className="flex-1 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded p-2 mb-4 bg-gray-50 dark:bg-gray-950/50 font-mono text-sm flex flex-col gap-1">
          {messages.length === 0 ? (
            <div className="text-gray-400 italic text-center mt-4">No messages yet. Connect to start.</div>
          ) : (
            messages.map((m, i) => (
              <div key={i} data-testid={`connection-msg-${m.type}`} className={`p-1 rounded ${
                m.type === 'sent' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 ml-8' :
                m.type === 'received' ? 'bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-200 mr-8' :
                m.type === 'error' ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 text-center' :
                'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200 text-center text-xs'
              }`}>
                <span className="text-[10px] opacity-50 block mb-0.5">{m.time.toLocaleTimeString()}</span>
                {m.data}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-2">
          {protocol === 'SOCKETIO' && (
            <input
              type="text"
              data-testid="connection-event-name-input"
              className="w-40 shrink-0 px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-sm"
              placeholder="Event name"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              disabled={!connected}
            />
          )}
          <input
            type="text"
            data-testid="connection-message-input"
            className="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-sm"
            placeholder="Type a message to send..."
            value={inputMsg}
            onChange={(e) => setInputMsg(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(); }}
            disabled={noSend}
          />
          <button
            data-testid="connection-send-btn"
            onClick={sendMessage}
            disabled={noSend}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-sm font-medium transition-colors"
          >
            Send
          </button>
          <button
            data-testid="connection-clear-btn"
            onClick={() => setMessages([])}
            className="p-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded text-gray-600 dark:text-gray-300 transition-colors"
            title="Clear Messages"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConnectionEditor;
