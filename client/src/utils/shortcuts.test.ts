import { describe, it, expect } from 'vitest';
import { validateShortcut, matchesShortcut, parseShortcut } from './shortcuts';

const ev = (init: Partial<KeyboardEvent>) => init as KeyboardEvent;

describe('shortcuts', () => {
  it('rejects browser-reserved combos (P3.7)', () => {
    expect(validateShortcut('ctrl+t', 'search', {})).toMatch(/reserved/);
    expect(validateShortcut('Ctrl+W', 'save', {})).toMatch(/reserved/);
  });
  it('rejects a collision with another action (P3.5)', () => {
    expect(validateShortcut('ctrl+enter', 'save', {})).toMatch(/already used/);
    expect(validateShortcut('ctrl+j', 'save', {})).toBeNull();
  });
  it('rejects malformed shortcuts', () => {
    expect(parseShortcut('ctrl+')).toBeNull();
    expect(validateShortcut('ctrl+ctrl', 'send', {})).not.toBeNull();
  });
  it('matches modifiers exactly', () => {
    expect(matchesShortcut(ev({ ctrlKey: true, key: 'K' }), 'ctrl+k')).toBe(true);
    expect(matchesShortcut(ev({ metaKey: true, key: 'k' }), 'ctrl+k')).toBe(true);
    expect(matchesShortcut(ev({ ctrlKey: true, shiftKey: true, key: 'k' }), 'ctrl+k')).toBe(false);
    expect(matchesShortcut(ev({ ctrlKey: true, shiftKey: true, key: 'p' }), 'ctrl+shift+p')).toBe(true);
  });
});
