const fs = require('fs');
const path = require('path');

function replaceInFile(filepath, regex, replacement) {
  if (fs.existsSync(filepath)) {
    let c = fs.readFileSync(filepath, 'utf8');
    c = c.replace(regex, replacement);
    fs.writeFileSync(filepath, c);
  }
}

// CLEAN 3: naming
replaceInFile('package.json', /com\.reqspaceclone\.app/g, 'com.reqspace.app');
replaceInFile('server/src/db/dbConfig.ts', /postman_clone/g, 'reqspace');
replaceInFile('server/src/tests/db.connection.manual.ts', /postman_clone/g, 'reqspace');

// CLEAN 5: stale capture copy
replaceInFile('server/src/utils/ssrf.ts', /share-proxy, capture, and WSDL-import routes/g, 'share-proxy and WSDL-import routes');
replaceInFile('client/src/pages/AdminPage.tsx', /Send \/ share-link \/ capture requests/g, 'Send / share-link requests');

// CLEAN 6: stale doc references
replaceInFile('scripts/smoke-core.sh', /TESTING\.md/g, 'TODO.md');
replaceInFile('server/src/tests/ssrf.test.ts', /CODE_REVIEW\.md/g, 'TODO.md');

// CLEAN 7: IGNORE.md drift
replaceInFile('IGNORE.md', /server\/src\/models\/AuditLog\.ts/g, 'server/src/repositories/AuditLogRepository.ts');
replaceInFile('IGNORE.md', /server\/src\/routes\/capture\.ts/g, 'server/src/routes/share.ts (formerly capture.ts)');
replaceInFile('IGNORE.md', /CaptureTrafficModal\.tsx/g, 'AdminPage.tsx (formerly CaptureTrafficModal)');

console.log('done text replacements');
