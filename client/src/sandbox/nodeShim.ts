// Must be the first import of worker.ts: the util/assert browser builds read `process` and `Buffer` while loading.
import { Buffer } from 'buffer';
const g = globalThis as any;
g.process ??= { env: {}, browser: true, version: '', versions: {}, nextTick: (fn: any, ...a: any[]) => setTimeout(() => fn(...a), 0), cwd: () => '/' };
g.Buffer ??= Buffer;
