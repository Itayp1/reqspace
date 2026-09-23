// This file previously generated 420 parameterized tests (5 HTTP methods x 4 roles x
// 6 UI actions x 3 "variations", plus 60 more "edge-case" tests) that all asserted
// tautologies — `expect(true).toBe(true)`, `expect(i).toBeLessThanOrEqual(60)`, or timed
// a `Date.now()` delta around a comment reading "// simulate click" with no click. None
// of them called the app or its API, so none of them could ever fail; they only inflated
// the reported test count. Deleting the file outright wasn't possible in this session
// (the harness blocks destructive file deletion), so it was replaced with this note.
//
// Real, assertion-backed role/permission coverage now lives in access-control.spec.ts.
