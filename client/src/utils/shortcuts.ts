export type ShortcutName = 'search' | 'save' | 'send';

export const DEFAULT_SHORTCUTS: Record<ShortcutName, string> = {
  search: 'ctrl+k',
  save: 'ctrl+s',
  send: 'ctrl+enter',
};

/** Combos the browser handles itself before the page ever sees them (P3.7). */
const RESERVED = new Set([
  'ctrl+t', 'ctrl+w', 'ctrl+n', 'ctrl+shift+t', 'ctrl+shift+n', 'ctrl+shift+w',
  'ctrl+tab', 'ctrl+shift+tab', 'ctrl+l', 'ctrl+r', 'ctrl+f4', 'alt+f4', 'alt+left', 'alt+right',
  'f5', 'f11', 'f12',
]);

const MODS = ['ctrl', 'meta', 'cmd', 'alt', 'shift'];

export interface ParsedShortcut { ctrl: boolean; alt: boolean; shift: boolean; key: string }

export function parseShortcut(raw: string): ParsedShortcut | null {
  const parts = raw.toLowerCase().replace(/\s+/g, '').split('+');
  const key = parts.pop() ?? '';
  if (!key || MODS.includes(key)) return null;
  const mods = new Set(parts);
  if (parts.length !== mods.size || [...mods].some((m) => !MODS.includes(m))) return null;
  return { ctrl: mods.has('ctrl') || mods.has('meta') || mods.has('cmd'), alt: mods.has('alt'), shift: mods.has('shift'), key };
}

export function normalizeShortcut(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, '').replace(/\b(meta|cmd)\b/g, 'ctrl');
}

/** Returns an error message, or null when the shortcut is acceptable. */
export function validateShortcut(raw: string, name: ShortcutName, current: Partial<Record<ShortcutName, string>>): string | null {
  const parsed = parseShortcut(raw);
  if (!parsed) return 'Invalid shortcut - use modifiers and a key, e.g. ctrl+k';
  const norm = normalizeShortcut(raw);
  if (RESERVED.has(norm)) return `${norm} is reserved by the browser - choose another shortcut`;
  for (const other of Object.keys(DEFAULT_SHORTCUTS) as ShortcutName[]) {
    if (other === name) continue;
    if (normalizeShortcut(current[other] || DEFAULT_SHORTCUTS[other]) === norm) {
      return `${norm} is already used by "${other}" - choose another shortcut`;
    }
  }
  return null;
}

export function matchesShortcut(e: KeyboardEvent, raw: string): boolean {
  const p = parseShortcut(raw);
  if (!p) return false;
  return !!(e.ctrlKey || e.metaKey) === p.ctrl && !!e.altKey === p.alt && !!e.shiftKey === p.shift && (e.key ?? '').toLowerCase() === p.key;
}
