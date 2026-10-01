import React, { useState, useEffect, useRef } from 'react';
import { useRequestStore } from '../../store/requestStore';
import { Play, Square, Trash2 } from 'lucide-react';
import { io, Socket } from 'socket.io-client';

export const ConnectionEditor: React.FC = () => {
  const { activeRequest, updateActiveRequest } = useRequestStore();
  
  const [messages, setMessages] = useState<{type: 'sent'|'received'|'info'|'error', data: string, time: Date}[]>([]);
  const [inputMsg, setInputMsg] = useState('');
  const [connected, setConnected] = useState(false);
  
  const wsRef = useRef<WebSocket | null>(null);
  const socketIoRef = useRef<Socket | null>(null);
  const sseRef = useRef<EventSource | null>(null);
  
  const protocol = activeRequest?.method || 'WS';
  const url = activeRequest?.url || '';

  const addMsg = (type: 'sent'|'received'|'info'|'error', data: string) => {
    setMessages(prev => [...prev, { type, data, time: new Date() }]);
  };

  const connect = () => {
    if (connected) return;
    
    if (protocol === 'WS') {
      try {
        const ws = new WebSocket(url);
        ws.onopen = () => {
          setConnected(true);
          addMsg('info', 'Connected to WebSocket');
        };
        ws.onmessage = (e) => addMsg('received', e.data);
        ws.onclose = () => {
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
        // Socket.IO expects base URL, we can pass it
        const socket = io(url, { transports: ['websocket', 'polling'] });
        socket.on('connect', () => {
          setConnected(true);
          addMsg('info', 'Connected to Socket.IO');
        });
        socket.on('disconnect', () => {
          setConnected(false);
          addMsg('info', 'Socket.IO disconnected');
        });
        socket.on('message', (msg) => addMsg('received', typeof msg === 'string' ? msg : JSON.stringify(msg)));
        socket.onAny((event, ...args) => {
          addMsg('received', `Event [${event}]: ${JSON.stringify(args)}`);
        });
        socketIoRef.current = socket;
      } catch (err: any) {
        addMsg('error', err.message);
      }
    } else if (protocol === 'SSE') {
      try {
        const sse = new EventSource(url);
        sse.onopen = () => {
          setConnected(true);
          addMsg('info', 'Connected to SSE');
        };
        sse.onmessage = (e) => addMsg('received', e.data);
        sse.onerror = () => {
          sse.close();
          setConnected(false);
          addMsg('error', 'SSE connection error');
        };
        sseRef.current = sse;
      } catch (err: any) {
        addMsg('error', err.message);
      }
    } else if (protocol === 'KAFKA') {
      // Mock Kafka connection via backend API polling or SSE
      addMsg('info', 'Kafka client requires backend integration (stubbed)');
      setConnected(true);
    }
  };

  const disconnect = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (socketIoRef.current) {
      socketIoRef.current.disconnect();
      socketIoRef.current = null;
    }
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
    setConnected(false);
    addMsg('info', 'Disconnected');
  };

  const sendMessage = () => {
    if (!inputMsg) return;
    
    if (protocol === 'WS' && wsRef.current) {
      wsRef.current.send(inputMsg);
      addMsg('sent', inputMsg);
    } else if (protocol === 'SOCKETIO' && socketIoRef.current) {
      socketIoRef.current.send(inputMsg);
      addMsg('sent', inputMsg);
    } else if (protocol === 'KAFKA') {
      addMsg('sent', `[Kafka Produce]: ${inputMsg}`);
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

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 overflow-hidden">
      <div className="flex items-center gap-2 p-2 border-b border-gray-200 dark:border-gray-800">
        <select 
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
          className="flex-1 px-3 py-1 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-sm"
          placeholder="Enter connection URL (e.g., ws://localhost:8080)"
          value={url}
          onChange={(e) => updateActiveRequest({ url: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter') connect(); }}
        />
        {connected ? (
          <button onClick={disconnect} className="flex items-center gap-1 px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded text-sm transition-colors">
            <Square size={14} /> Disconnect
          </button>
        ) : (
          <button onClick={connect} className="flex items-center gap-1 px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm transition-colors">
            <Play size={14} /> Connect
          </button>
        )}
      </div>
      
      <div className="flex-1 flex flex-col p-4 overflow-hidden min-h-0">
        <div className="flex-1 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded p-2 mb-4 bg-gray-50 dark:bg-gray-950/50 font-mono text-sm flex flex-col gap-1">
          {messages.length === 0 ? (
            <div className="text-gray-400 italic text-center mt-4">No messages yet. Connect to start.</div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={`p-1 rounded ${
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
          <input
            type="text"
            className="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-sm"
            placeholder="Type a message to send..."
            value={inputMsg}
            onChange={(e) => setInputMsg(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(); }}
            disabled={!connected || protocol === 'SSE'}
          />
          <button 
            onClick={sendMessage}
            disabled={!connected || protocol === 'SSE'}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-sm font-medium transition-colors"
          >
            Send
          </button>
          <button 
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
