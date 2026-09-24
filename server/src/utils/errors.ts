export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export function httpStatus(err: unknown): number {
  if (err instanceof HttpError) return err.status;
  if (typeof err === 'object' && err !== null) {
    const rec = err as { status?: unknown; statusCode?: unknown };
    if (typeof rec.status === 'number') return rec.status;
    if (typeof rec.statusCode === 'number') return rec.statusCode;
  }
  return 500;
}

export function errorCause(err: unknown): Error | undefined {
  if (!(err instanceof Error)) return undefined;
  const cause = (err as Error & { cause?: unknown }).cause;
  return cause instanceof Error ? cause : undefined;
}
