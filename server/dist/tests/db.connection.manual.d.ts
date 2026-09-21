#!/usr/bin/env ts-node
/**
 * Manual DB Connection Tester
 * Usage: npx ts-node src/tests/db.connection.manual.ts
 *
 * Tests connection and basic table creation against any configured DB.
 * Set env vars before running, e.g.:
 *
 *   DB_TYPE=mysql DB_HOST=localhost DB_PORT=3306 DB_NAME=postman_clone DB_USER=root DB_PASSWORD=secret
 *   DB_TYPE=postgres DB_HOST=localhost DB_PORT=5432 DB_NAME=postman_clone DB_USER=postgres DB_PASSWORD=pass
 *   DB_TYPE=mssql DB_HOST=localhost DB_PORT=1433 DB_NAME=postman_clone DB_USER=sa DB_PASSWORD=Pass1234!
 *   DB_TYPE=mongodb MONGO_URI=mongodb://localhost:27017/postman_clone
 *   DB_TYPE=sqlite DB_STORAGE_PATH=./test.sqlite
 *   DB_CONNECTION_STRING=postgres://user:pass@host:5432/db  (with DB_TYPE=postgres)
 */
export {};
//# sourceMappingURL=db.connection.manual.d.ts.map