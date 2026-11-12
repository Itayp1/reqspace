import { describe, it, expect } from 'vitest';
import { parseCsv } from './CollectionRunnerModal';

describe('parseCsv', () => {
  it('handles quoted commas, escaped quotes, CRLF, BOM, blank lines and Hebrew', () => {
    const csv = '﻿name,note,city\r\n"Doe, John","say ""hi""",תל אביב\r\n\r\nJane,,\r\nBob\r\n';
    expect(parseCsv(csv)).toEqual([
      { name: 'Doe, John', note: 'say "hi"', city: 'תל אביב' },
      { name: 'Jane', note: '', city: '' },
      { name: 'Bob', note: '', city: '' },
    ]);
  });
  it('returns [] for empty input', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('a,b\n')).toEqual([]);
  });
});
