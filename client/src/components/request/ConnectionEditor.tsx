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

type Msg = {
  id: number;
  type: 'sent' | 'received' | 'info' | 'error';
  data: string;
  time: Date;
  read: boolean;
  /** Kafka coordinates, needed to commit the offset when the message is marked read. */
  kafka?: { partition: number; offset: string };
};

// Kafka and authenticated / SSL-tuned WebSockets run in the Electron main process; browsers can't do either.
const desktop = () => (window as any).electron?.connOpen ? ((window as any).electron as any) : null;
const DESKTOP_ONLY = 'Available only in the Electron desktop app';

const INPUT_CLS = 'px-2 py-1 bg-surface text-text border border-border rounded disabled:opacity-60';

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

  const [messages, setMessages] = useState<Msg[]>([]);
  const nextMsgId = useRef(1);
  const connId = useRef(`c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`);
  const [kafkaLists, setKafkaLists] = useState<{ topics: string[]; groups: string[] }>({ topics: [], groups: [] });
  const secrets = conn.secrets ?? {};
  const setSecret = (k: keyof NonNullable<ConnectionSettings['secrets']>, v: string) => updateConn({ secrets: { ...secrets, [k]: v } });
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
  // True while the live connection runs in the desktop main process (Kafka, or WebSocket with auth / SSL options).
  const desktopConnRef = useRef(false);
  const listenRef = useRef<string[]>([]);
  listenRef.current = conn.listen ?? [];

  const protocol = activeRequest?.method || 'WS';
  const rawUrl = activeRequest?.url || '';
  // {{var}} in the URL / headers / protocols / auth resolves against the active environment.
  const resolve = (t: string) => resolveAllVariables(t, activeRequest?.collectionId);

  const addMsg = (type: Msg['type'], data: string, kafka?: Msg['kafka']) => {
    setMessages(prev => [...prev, { id: nextMsgId.current++, type, data, time: new Date(), read: type !== 'received', kafka }]);
  };

  const unread = messages.filter(m => m.type === 'received' && !m.read).length;
  // Commits offset+1 per partition, using the highest offset among the messages marked read.
  const commitOffsets = async (targets: Msg[]) => {
    const api = desktop();
    if (!api || !conn.kafkaCommitOnRead) return;
    const best = new Map<number, string>();
    for (const m of targets) {
      if (!m.kafka) continue;
      const cur = best.get(m.kafka.partition);
      if (cur === undefined || BigInt(m.kafka.offset) > BigInt(cur)) best.set(m.kafka.partition, m.kafka.offset);
    }
    for (const [partition, offset] of best) {
      const r = await api.connCommit(connId.current, { partition, offset });
      if (r.ok) addMsg('info', `Committed offset ${BigInt(offset) + 1n} on partition ${partition}`);
      else addMsg('error', `Offset commit failed: ${r.error}`);
    }
  };
  const setRead = (ids: number[], read: boolean) => {
    const targets = messages.filter(m => ids.includes(m.id) && m.type === 'received' && m.read !== read);
    setMessages(prev => prev.map(m => (ids.includes(m.id) && m.type === 'received' ? { ...m, read } : m)));
    if (read) void commitOffsets(targets);
  };

  // Events pushed from the desktop main process (Kafka messages, desktop WebSocket frames).
  useEffect(() => {
    const api = desktop();
    if (!api?.onConnEvent) return;
    return api.onConnEvent((id: string, ev: any) => {
      if (id !== connId.current) return;
      if (ev.type === 'message') {
        if (ev.partition !== undefined) {
          const hdr = Object.keys(ev.headers ?? {}).length ? ` headers=${JSON.stringify(ev.headers)}` : '';
          addMsg('received', `[p${ev.partition} #${ev.offset}]${ev.key !== null ? ` key=${ev.key}` : ''}${hdr} ${ev.value}`, { partition: ev.partition, offset: ev.offset });
        } else addMsg('received', ev.value);
      } else if (ev.type === 'error') addMsg('error', ev.error);
      else if (ev.type === 'closed') { setConnected(false); addMsg('info', 'WebSocket closed'); }
    });
  }, []);

  // Kafka settings resolved against the active environment, in the shape the main process expects.
  const kafkaCfg = () => ({
    brokers: resolve(rawUrl).replace(/^kafka:\/\//, ''),
    topic: resolve(conn.kafkaTopic ?? '').trim(),
    groupId: resolve(conn.kafkaGroup ?? '').trim() || undefined,
    clientId: resolve(conn.kafkaClientId ?? '').trim() || undefined,
    fromBeginning: !!conn.kafkaFromBeginning,
    partition: /^\d+$/.test((conn.kafkaPartition ?? '').trim()) ? Number(conn.kafkaPartition) : undefined,
    commitOnRead: !!conn.kafkaCommitOnRead,
    sasl: !!conn.kafkaSasl,
    mechanism: conn.kafkaMechanism ?? 'plain',
    username: resolve(conn.kafkaUsername ?? ''),
    password: resolve(secrets.kafkaPassword ?? ''),
    ssl: !!conn.kafkaSsl,
    rejectUnauthorized: conn.kafkaVerifySsl !== false,
    ca: secrets.kafkaCa || undefined,
    cert: secrets.kafkaCert || undefined,
    key: secrets.kafkaKey || undefined,
  });

  const loadKafkaLists = async () => {
    const api = desktop();
    if (!api) return;
    const r = await api.kafkaList(kafkaCfg());
    if (r.ok) { setKafkaLists(r.data); addMsg('info', `Loaded ${r.data.topics.length} topics, ${r.data.groups.length} groups`); }
    else addMsg('error', `Could not list topics: ${r.error}`);
  };

  const connect = () => {
    if (connected) return;
    const url = resolve(rawUrl);

    if (protocol === 'WS' && (conn.wsAuthType && conn.wsAuthType !== 'none' || conn.wsVerifySsl === false)) {
      const api = desktop();
      if (!api) { addMsg('error', `WebSocket auth / SSL options: ${DESKTOP_ONLY}`); return; }
      const wsHeaders: Record<string, string> = {};
      if (conn.wsAuthType === 'headers') for (const h of headers) if (h.enabled && h.key.trim()) wsHeaders[h.key.trim()] = resolve(h.value);
      if (conn.wsAuthType === 'bearer') wsHeaders.Authorization = `Bearer ${resolve(secrets.wsToken ?? '')}`;
      if (conn.wsAuthType === 'basic') wsHeaders.Authorization = `Basic ${btoa(`${resolve(conn.wsUsername ?? '')}:${resolve(secrets.wsPassword ?? '')}`)}`;
      void api.connOpen(connId.current, 'ws', { url, protocols: resolve(conn.wsProtocols || ''), headers: wsHeaders, rejectUnauthorized: conn.wsVerifySsl !== false }).then((r: any) => {
        if (!r.ok) { addMsg('error', `WebSocket error: ${r.error}`); return; }
        desktopConnRef.current = true;
        setConnected(true);
        addMsg('info', `Connected to WebSocket${r.data ? ` (protocol: ${r.data})` : ''}`);
      });
    } else if (protocol === 'WS') {
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
      const api = desktop();
      if (!api) { addMsg('error', `Kafka: ${DESKTOP_ONLY}`); return; }
      const part = (conn.kafkaPartition ?? '').trim();
      if (part && !/^\d+$/.test(part)) { addMsg('error', 'Partition must be a number (or empty for all)'); return; }
      if (!conn.kafkaTopic?.trim()) { addMsg('error', 'Topic is required'); return; }
      addMsg('info', 'Connecting to Kafka…');
      void api.connOpen(connId.current, 'kafka', kafkaCfg()).then((r: any) => {
        if (!r.ok) { addMsg('error', `Kafka error: ${r.error}`); return; }
        desktopConnRef.current = true;
        setConnected(true);
        addMsg('info', `Subscribed to ${conn.kafkaTopic} (group ${conn.kafkaGroup?.trim() || 'auto'})`);
      });
    }
  };

  const disconnect = () => {
    // Was there anything to tear down? React's dev-mode double-invoked
    // effects run this cleanup once right after mount, and logging
    // unconditionally made every fresh connection tab open on a bogus
    // "Disconnected" line.
    const hadTransport = !!(wsRef.current || socketIoRef.current || sseAbortRef.current || desktopConnRef.current);

    if (desktopConnRef.current) {
      desktopConnRef.current = false;
      void desktop()?.connClose(connId.current);
    }

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

    if (desktopConnRef.current) {
      let hdrs: Record<string, string> | undefined;
      if (protocol === 'KAFKA' && conn.kafkaHeaders?.trim()) {
        try { hdrs = JSON.parse(resolve(conn.kafkaHeaders)); } catch { addMsg('error', 'Headers must be a JSON object — message not sent'); return; }
      }
      const value = resolve(inputMsg);
      void desktop()?.connSend(connId.current, { value, key: resolve(conn.kafkaKey ?? '') || undefined, headers: hdrs }).then((r: any) => {
        if (r.ok) addMsg('sent', protocol === 'KAFKA' ? `${conn.kafkaKey ? `key=${conn.kafkaKey} ` : ''}${value}` : value);
        else addMsg('error', `Send failed: ${r.error}`);
      });
      setInputMsg('');
      return;
    }

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

  const noSend = !connected || protocol === 'SSE';

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      <div className="flex items-center gap-2 p-2 border-b border-border">
        <select
          data-testid="connection-protocol-select"
          aria-label="Protocol"
          className="px-2 py-1 bg-surface text-text border border-border rounded text-sm"
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
          aria-label={protocol === 'KAFKA' ? 'Kafka brokers' : 'Connection URL'}
          autoComplete="off"
          spellCheck={false}
          className="flex-1 px-3 py-1 bg-surface text-text border border-border rounded text-sm font-mono"
          placeholder={protocol === 'KAFKA' ? 'Brokers, e.g. localhost:9092,broker2:9092' : 'Enter connection URL, e.g. ws://localhost:8080…'}
          value={rawUrl}
          onChange={(e) => updateActiveRequest({ url: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter') connect(); }}
        />
        {connected ? (
          <button data-testid="connection-disconnect-btn" onClick={disconnect} className="flex items-center gap-1 px-3 py-1 bg-delete hover:opacity-90 text-white rounded text-sm transition-opacity">
            <Square size={14} aria-hidden="true" /> Disconnect
          </button>
        ) : (
          <button data-testid="connection-connect-btn" onClick={connect} className="flex items-center gap-1 px-3 py-1 bg-primary-strong hover:opacity-90 text-white rounded text-sm transition-opacity">
            <Play size={14} aria-hidden="true" /> Connect
          </button>
        )}
        <button data-testid="request-save-btn" onClick={saveConnection} title="Save connection to a collection" className="flex items-center gap-1 px-3 py-1 border border-border text-text rounded text-sm hover:bg-surface">
          <Save size={14} aria-hidden="true" /> Save
        </button>
      </div>
      {saveOpen && <SaveRequestModal onClose={() => setSaveOpen(false)} />}

      {protocol === 'KAFKA' && (
        <div className="px-3 py-2 border-b border-border text-xs flex flex-col gap-2">
          {!desktop() && (
            <div data-testid="connection-kafka-desktop-banner" className="p-2 rounded border border-border bg-surface text-text-muted">
              Kafka is available only in the Electron desktop app. Browsers cannot open broker connections.
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <input data-testid="connection-kafka-topic" aria-label="Kafka topic" list="kafka-topics" className={`w-56 ${INPUT_CLS}`} placeholder="Topic (required)" value={conn.kafkaTopic ?? ''} onChange={(e) => updateConn({ kafkaTopic: e.target.value })} disabled={connected} />
            <input data-testid="connection-kafka-group" aria-label="Kafka consumer group" list="kafka-groups" className={`w-56 ${INPUT_CLS}`} placeholder="Consumer group (empty = new)" value={conn.kafkaGroup ?? ''} onChange={(e) => updateConn({ kafkaGroup: e.target.value })} disabled={connected} />
            <input data-testid="connection-kafka-client-id" aria-label="Kafka client id" className={`w-40 ${INPUT_CLS}`} placeholder="Client id" value={conn.kafkaClientId ?? ''} onChange={(e) => updateConn({ kafkaClientId: e.target.value })} disabled={connected} />
            <input data-testid="connection-kafka-partition" aria-label="Kafka partition" inputMode="numeric" className={`w-28 ${INPUT_CLS}`} placeholder="Partition (all)" value={conn.kafkaPartition ?? ''} onChange={(e) => updateConn({ kafkaPartition: e.target.value })} disabled={connected} />
            <datalist id="kafka-topics">{kafkaLists.topics.map((t) => <option key={t} value={t} />)}</datalist>
            <datalist id="kafka-groups">{kafkaLists.groups.map((g) => <option key={g} value={g} />)}</datalist>
            <button data-testid="connection-kafka-load-lists" type="button" className="px-2 py-1 border border-border rounded hover:bg-surface disabled:opacity-50" onClick={loadKafkaLists} disabled={!desktop() || connected} title="List topics and consumer groups from the brokers">Load topics &amp; groups</button>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-1"><input data-testid="connection-kafka-from-beginning" type="checkbox" checked={!!conn.kafkaFromBeginning} onChange={(e) => updateConn({ kafkaFromBeginning: e.target.checked })} disabled={connected} /> Read from beginning</label>
            <label className="flex items-center gap-1" title="Off: marking read is only a local flag. On: auto-commit is disabled and marking a message read commits its offset on the broker."><input data-testid="connection-kafka-commit" type="checkbox" checked={!!conn.kafkaCommitOnRead} onChange={(e) => updateConn({ kafkaCommitOnRead: e.target.checked })} disabled={connected} /> Commit offset when marked read</label>
            <label className="flex items-center gap-1"><input data-testid="connection-kafka-sasl" type="checkbox" checked={!!conn.kafkaSasl} onChange={(e) => updateConn({ kafkaSasl: e.target.checked })} disabled={connected} /> Authentication (SASL)</label>
            <label className="flex items-center gap-1"><input data-testid="connection-kafka-ssl" type="checkbox" checked={!!conn.kafkaSsl} onChange={(e) => updateConn({ kafkaSsl: e.target.checked })} disabled={connected} /> SSL / TLS</label>
          </div>
          {conn.kafkaSasl && (
            <div className="flex items-center gap-2">
              <select data-testid="connection-kafka-mechanism" aria-label="SASL mechanism" className={INPUT_CLS} value={conn.kafkaMechanism ?? 'plain'} onChange={(e) => updateConn({ kafkaMechanism: e.target.value as ConnectionSettings['kafkaMechanism'] })} disabled={connected}>
                <option value="plain">PLAIN</option>
                <option value="scram-sha-256">SCRAM-SHA-256</option>
                <option value="scram-sha-512">SCRAM-SHA-512</option>
              </select>
              <input data-testid="connection-kafka-username" aria-label="Kafka username" autoComplete="off" className={`w-48 ${INPUT_CLS}`} placeholder="Username" value={conn.kafkaUsername ?? ''} onChange={(e) => updateConn({ kafkaUsername: e.target.value })} disabled={connected} />
              <input data-testid="connection-kafka-password" aria-label="Kafka password" type="password" autoComplete="new-password" className={`w-48 ${INPUT_CLS}`} placeholder="Password" value={secrets.kafkaPassword ?? ''} onChange={(e) => setSecret('kafkaPassword', e.target.value)} disabled={connected} />
            </div>
          )}
          {conn.kafkaSsl && (
            <div className="flex flex-col gap-1">
              <label className="flex items-center gap-1"><input data-testid="connection-kafka-verify-ssl" type="checkbox" checked={conn.kafkaVerifySsl !== false} onChange={(e) => updateConn({ kafkaVerifySsl: e.target.checked })} disabled={connected} /> Verify server certificate</label>
              <div className="flex items-center gap-2">
                <textarea aria-label="Kafka CA certificate" spellCheck={false} rows={2} className={`flex-1 font-mono ${INPUT_CLS}`} placeholder="CA certificate (PEM, optional)" value={secrets.kafkaCa ?? ''} onChange={(e) => setSecret('kafkaCa', e.target.value)} disabled={connected} />
                <textarea aria-label="Kafka client certificate" spellCheck={false} rows={2} className={`flex-1 font-mono ${INPUT_CLS}`} placeholder="Client certificate (PEM, optional)" value={secrets.kafkaCert ?? ''} onChange={(e) => setSecret('kafkaCert', e.target.value)} disabled={connected} />
                <textarea aria-label="Kafka client key" spellCheck={false} rows={2} className={`flex-1 font-mono ${INPUT_CLS}`} placeholder="Client private key (PEM)" value={secrets.kafkaKey ?? ''} onChange={(e) => setSecret('kafkaKey', e.target.value)} disabled={connected} />
              </div>
            </div>
          )}
        </div>
      )}
      {protocol === 'WS' && (
        <div className="px-3 py-2 border-b border-border text-xs flex items-center gap-2">
          <input
            data-testid="connection-ws-protocols-input"
            aria-label="WebSocket sub-protocols"
            className={`flex-1 ${INPUT_CLS}`}
            placeholder="Sub-protocols (Sec-WebSocket-Protocol), comma separated, supports {{var}}…"
            value={conn.wsProtocols ?? ''}
            onChange={(e) => updateConn({ wsProtocols: e.target.value })}
            disabled={connected}
          />
          <span className="text-text-muted">Browsers cannot send custom headers on a WebSocket; pass a token via a sub-protocol or the URL.</span>
        </div>
      )}
      {protocol === 'WS' && (
        <div className="px-3 py-2 border-b border-border text-xs flex flex-col gap-2">
          {!desktop() && <span data-testid="connection-ws-desktop-note" className="text-text-muted">Authentication headers and SSL options: {DESKTOP_ONLY}.</span>}
          <div className="flex items-center gap-2 flex-wrap">
            <select data-testid="connection-ws-auth-type" aria-label="WebSocket authentication" className={INPUT_CLS} value={conn.wsAuthType ?? 'none'} onChange={(e) => updateConn({ wsAuthType: e.target.value as ConnectionSettings['wsAuthType'] })} disabled={connected || !desktop()}>
              <option value="none">No authentication</option>
              <option value="bearer">Bearer token</option>
              <option value="basic">Basic auth</option>
              <option value="headers">Custom headers</option>
            </select>
            {conn.wsAuthType === 'bearer' && <input data-testid="connection-ws-token" aria-label="Bearer token" type="password" autoComplete="off" className={`flex-1 ${INPUT_CLS}`} placeholder="Token" value={secrets.wsToken ?? ''} onChange={(e) => setSecret('wsToken', e.target.value)} disabled={connected} />}
            {conn.wsAuthType === 'basic' && (
              <>
                <input data-testid="connection-ws-username" aria-label="WebSocket username" autoComplete="off" className={`w-48 ${INPUT_CLS}`} placeholder="Username" value={conn.wsUsername ?? ''} onChange={(e) => updateConn({ wsUsername: e.target.value })} disabled={connected} />
                <input data-testid="connection-ws-password" aria-label="WebSocket password" type="password" autoComplete="new-password" className={`w-48 ${INPUT_CLS}`} placeholder="Password" value={secrets.wsPassword ?? ''} onChange={(e) => setSecret('wsPassword', e.target.value)} disabled={connected} />
              </>
            )}
            <label className="flex items-center gap-1"><input data-testid="connection-ws-verify-ssl" type="checkbox" checked={conn.wsVerifySsl !== false} onChange={(e) => updateConn({ wsVerifySsl: e.target.checked })} disabled={connected || !desktop()} /> Verify SSL certificate (wss://)</label>
          </div>
          {conn.wsAuthType === 'headers' && (
            <div className="flex flex-col gap-1">
              {headers.map((h, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input aria-label="Header name" className={`w-48 ${INPUT_CLS}`} placeholder="Header" value={h.key} onChange={(e) => updateActiveRequest({ headers: headers.map((x, j) => j === i ? { ...x, key: e.target.value } : x) })} disabled={connected} />
                  <input aria-label="Header value" className={`flex-1 ${INPUT_CLS}`} placeholder="Value" value={h.value} onChange={(e) => updateActiveRequest({ headers: headers.map((x, j) => j === i ? { ...x, value: e.target.value } : x) })} disabled={connected} />
                  <button aria-label="Remove header" onClick={() => updateActiveRequest({ headers: headers.filter((_, j) => j !== i) })} disabled={connected}>x</button>
                </div>
              ))}
              <button className="self-start text-primary hover:underline" onClick={() => updateActiveRequest({ headers: [...headers, { key: '', value: '', enabled: true }] })} disabled={connected}>+ Add header</button>
            </div>
          )}
        </div>
      )}
      {protocol === 'SOCKETIO' && (
        <div className="px-3 py-2 border-b border-border text-xs flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input data-testid="connection-sio-path-input" aria-label="Socket.IO path" className={`w-56 ${INPUT_CLS}`} placeholder="Path (default /socket.io)" value={conn.sioPath ?? ''} onChange={(e) => updateConn({ sioPath: e.target.value })} disabled={connected} />
            <input data-testid="connection-sio-query-input" aria-label="Socket.IO query" className={`w-56 ${INPUT_CLS}`} placeholder="Query (a=1&b=2)" value={conn.sioQuery ?? ''} onChange={(e) => updateConn({ sioQuery: e.target.value })} disabled={connected} />
            <input data-testid="connection-sio-auth-input" aria-label="Socket.IO auth payload" spellCheck={false} className={`flex-1 ${INPUT_CLS}`} placeholder='Auth payload JSON, e.g. {"token":"{{token}}"}' value={conn.sioAuth ?? ''} onChange={(e) => updateConn({ sioAuth: e.target.value })} disabled={connected} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-text-muted">Listen to events (empty = all):</span>
            {(conn.listen ?? []).map((ev) => (
              <span key={ev} data-testid="connection-listen-chip" className="px-2 py-0.5 bg-surface border border-border rounded">
                {ev} <button type="button" className="ml-1 text-text-muted hover:text-delete" aria-label={`Remove ${ev}`} onClick={() => updateConn({ listen: (conn.listen ?? []).filter(x => x !== ev) })}>x</button>
              </span>
            ))}
            <input
              data-testid="connection-listen-input"
              aria-label="Add event to listen to"
              className={`w-44 ${INPUT_CLS}`}
              placeholder="Add event name, then Enter…"
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
        <div className="px-3 py-2 border-b border-border text-xs flex flex-col gap-1">
          <span className="text-text-muted">Headers (e.g. Authorization). Sent via fetch streaming, because the browser EventSource cannot set headers.</span>
          {headers.map((h, i) => (
            <div key={i} className="flex items-center gap-2">
              <input data-testid="connection-sse-header-key" aria-label="Header name" className={`w-48 ${INPUT_CLS}`} placeholder="Header" value={h.key} onChange={(e) => updateActiveRequest({ headers: headers.map((x, j) => j === i ? { ...x, key: e.target.value } : x) })} disabled={connected} />
              <input data-testid="connection-sse-header-value" aria-label="Header value" className={`flex-1 ${INPUT_CLS}`} placeholder="Value" value={h.value} onChange={(e) => updateActiveRequest({ headers: headers.map((x, j) => j === i ? { ...x, value: e.target.value } : x) })} disabled={connected} />
              <button aria-label="Remove header" onClick={() => updateActiveRequest({ headers: headers.filter((_, j) => j !== i) })} disabled={connected}>x</button>
            </div>
          ))}
          <button data-testid="connection-sse-add-header" className="self-start text-primary hover:underline" onClick={() => updateActiveRequest({ headers: [...headers, { key: '', value: '', enabled: true }] })} disabled={connected}>+ Add header</button>
        </div>
      )}

      <div className="flex-1 flex flex-col p-4 overflow-hidden min-h-0">
        <div className="flex items-center gap-3 mb-2 text-xs text-text-muted">
          <span data-testid="connection-unread-count">Unread: {unread}</span>
          <button data-testid="connection-mark-all-read" type="button" className="text-primary hover:underline disabled:opacity-50 disabled:no-underline" disabled={unread === 0} onClick={() => setRead(messages.filter(m => m.type === 'received' && !m.read).map(m => m.id), true)}>Mark all read</button>
        </div>
        <div data-testid="connection-message-log"className="flex-1 overflow-y-auto border border-border rounded p-2 mb-4 bg-surface font-mono text-sm flex flex-col gap-1">
          {messages.length === 0 ? (
            <div className="text-text-muted text-center mt-4">No messages yet. Connect to start.</div>
          ) : (
            messages.map((m) => (
              <div key={m.id} data-testid={`connection-msg-${m.type}`} data-read={m.type === 'received' ? String(m.read) : undefined} className={`p-1 rounded ${m.type === 'received' && !m.read ? 'font-semibold ' : ''}${
                m.type === 'sent' ? 'bg-primary/10 text-text ml-8 border-l-2 border-primary' :
                m.type === 'received' ? 'bg-border/50 text-text mr-8' :
                m.type === 'error' ? 'bg-delete/10 text-delete text-center' :
                'text-text-muted text-center text-xs'
              }`}>
                <span className="text-[10px] text-text-muted flex items-center gap-2 mb-0.5">
                  {m.time.toLocaleTimeString()}
                  {m.type === 'received' && (
                    <button data-testid="connection-msg-read-toggle" type="button" className="text-primary hover:underline" onClick={() => setRead([m.id], !m.read)}>
                      {m.read ? 'Mark unread' : 'Mark read'}
                    </button>
                  )}
                </span>
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
              aria-label="Event name"
              className="w-40 shrink-0 px-3 py-2 bg-surface text-text border border-border rounded text-sm disabled:opacity-60"
              placeholder="Event name"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              disabled={!connected}
            />
          )}
          {protocol === 'KAFKA' && (
            <>
              <input data-testid="connection-kafka-key" aria-label="Message key" className="w-32 shrink-0 px-3 py-2 bg-surface text-text border border-border rounded text-sm disabled:opacity-60" placeholder="Key" value={conn.kafkaKey ?? ''} onChange={(e) => updateConn({ kafkaKey: e.target.value })} disabled={!connected} />
              <input data-testid="connection-kafka-headers" aria-label="Message headers" spellCheck={false} className="w-44 shrink-0 px-3 py-2 bg-surface text-text border border-border rounded text-sm font-mono disabled:opacity-60" placeholder='Headers {"a":"b"}' value={conn.kafkaHeaders ?? ''} onChange={(e) => updateConn({ kafkaHeaders: e.target.value })} disabled={!connected} />
            </>
          )}
          <input
            type="text"
            data-testid="connection-message-input"
            aria-label="Message"
            autoComplete="off"
            className="flex-1 px-3 py-2 bg-surface text-text border border-border rounded text-sm font-mono disabled:opacity-60"
            placeholder="Type a message to send…"
            value={inputMsg}
            onChange={(e) => setInputMsg(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(); }}
            disabled={noSend}
          />
          <button
            data-testid="connection-send-btn"
            onClick={sendMessage}
            disabled={noSend}
            className="px-4 py-2 bg-primary-strong hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-sm font-medium transition-opacity"
          >
            Send
          </button>
          <button
            data-testid="connection-clear-btn"
            onClick={() => setMessages([])}
            className="p-2 border border-border hover:bg-surface rounded text-text-muted transition-colors"
            title="Clear Messages"
            aria-label="Clear messages"
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConnectionEditor;
