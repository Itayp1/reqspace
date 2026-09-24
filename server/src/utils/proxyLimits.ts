export const MAX_PROXY_TIMEOUT_MS = 120_000;
export const DEFAULT_PROXY_TIMEOUT_MS = 30_000;
export const MAX_PROXY_RESPONSE_BYTES = 10 * 1024 * 1024;

export function clampTimeout(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PROXY_TIMEOUT_MS;
  return Math.min(Math.max(Math.floor(n), 1), MAX_PROXY_TIMEOUT_MS);
}

/** Read a response body up to `cap` bytes. Returns 413-sized error when exceeded. */
export async function readCappedBody(body: ReadableStream<Uint8Array> | null, cap = MAX_PROXY_RESPONSE_BYTES): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  const reader = body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel();
      const err: any = new Error('Proxy response exceeded the size limit');
      err.status = 413;
      err.name = 'PayloadTooLarge';
      throw err;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}
