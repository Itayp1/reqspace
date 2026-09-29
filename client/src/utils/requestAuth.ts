import type { RequestAuth } from '../store/requestStore';

type AuthCarrier = { auth?: RequestAuth | null; _id?: string; parentFolderId?: string | null };

/** Closest folder first, then its parents. Stops on a missing id or a cycle. */
export function folderChainClosestFirst<T extends { _id: string; parentFolderId?: string | null }>(
  folderId: string | null | undefined,
  folders: T[],
): T[] {
  const chain: T[] = [];
  const seen = new Set<string>();
  let current = folderId || null;
  while (current && !seen.has(current)) {
    seen.add(current);
    const folder = folders.find(f => f._id === current);
    if (!folder) break;
    chain.push(folder);
    current = folder.parentFolderId ?? null;
  }
  return chain;
}

/**
 * A request with type `inherit` takes the nearest ancestor auth that is not
 * itself `inherit`: parent folder, then that folder's parents, then the collection.
 */
export function resolveInheritedAuth(
  auth: RequestAuth | null | undefined,
  foldersClosestFirst: AuthCarrier[],
  collection?: AuthCarrier | null,
): RequestAuth | null | undefined {
  if (auth?.type !== 'inherit') return auth;
  for (const folder of foldersClosestFirst) {
    if (folder.auth && folder.auth.type !== 'inherit') return folder.auth;
  }
  if (collection?.auth && collection.auth.type !== 'inherit') return collection.auth;
  return auth;
}

function encodeBasic(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function appendQuery(url: string, key: string, value: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.append(key, value);
    return parsed.toString();
  } catch {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  }
}

/**
 * Turns the auth tab into headers (and, for an API key in the query string, a URL).
 * Does not touch the body — callers encode form-data / urlencoded / graphql on their own.
 */
export function applyRequestAuth(opts: {
  auth: RequestAuth | null | undefined;
  headers: Record<string, string>;
  url: string;
  resolve?: (value: string) => string;
}): { headers: Record<string, string>; url: string } {
  const resolve = opts.resolve ?? ((value: string) => value);
  const headers = { ...opts.headers };
  let url = opts.url;
  const auth = opts.auth;
  if (!auth || auth.type === 'none' || auth.type === 'inherit') {
    return { headers, url };
  }

  if (auth.type === 'bearer' && auth.bearer?.token) {
    const token = resolve(auth.bearer.token);
    if (token) headers.Authorization = `Bearer ${token}`;
  } else if (auth.type === 'basic' && auth.basic?.username) {
    const username = resolve(auth.basic.username);
    const password = resolve(auth.basic.password || '');
    headers.Authorization = `Basic ${encodeBasic(username, password)}`;
  } else if (auth.type === 'apikey' && auth.apikey?.key) {
    const key = resolve(auth.apikey.key);
    const value = resolve(auth.apikey.value || '');
    if (key && auth.apikey.in === 'query') {
      url = appendQuery(url, key, value);
    } else if (key) {
      headers[key] = value;
    }
  } else if (auth.type === 'oauth2' && auth.oauth2?.token) {
    const token = resolve(auth.oauth2.token);
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  return { headers, url };
}
