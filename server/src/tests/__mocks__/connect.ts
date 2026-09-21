/**
 * Mock for db/connect.ts
 * Tests inject this mock so they control isMongo() behavior.
 */

let _isMongo = false;

export function isMongo(): boolean {
  return _isMongo;
}

export function __setIsMongo(val: boolean) {
  _isMongo = val;
}

export async function connectDb(): Promise<void> {
  // no-op in tests
}
