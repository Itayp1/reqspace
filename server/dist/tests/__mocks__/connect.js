"use strict";
/**
 * Mock for db/connect.ts
 * Tests inject this mock so they control isMongo() behavior.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isMongo = isMongo;
exports.__setIsMongo = __setIsMongo;
exports.connectDb = connectDb;
let _isMongo = false;
function isMongo() {
    return _isMongo;
}
function __setIsMongo(val) {
    _isMongo = val;
}
async function connectDb() {
    // no-op in tests
}
//# sourceMappingURL=connect.js.map