export function toJUnit(suiteName: string, results: Array<{ name: string; passed: boolean; error?: string; timeMs?: number }>): string {
  const failures = results.filter((r) => !r.passed).length;
  const cases = results.map((r) => {
    const time = ((r.timeMs || 0) / 1000).toFixed(3);
    const body = r.passed ? '' : `<failure message="${escapeXml(r.error || 'failed')}"></failure>`;
    return `<testcase name="${escapeXml(r.name)}" time="${time}">${body}</testcase>`;
  }).join('');
  return `<?xml version="1.0"?><testsuite name="${escapeXml(suiteName)}" tests="${results.length}" failures="${failures}">${cases}</testsuite>`;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const SECRET_PATTERNS = [/AKIA[0-9A-Z]{16}/, /sk_live_[0-9a-zA-Z]+/, /-----BEGIN [A-Z ]+PRIVATE KEY-----/, /Bearer\s+eyJ[A-Za-z0-9_-]{20,}/];

export function scanSecrets(text: string): string[] {
  return SECRET_PATTERNS.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
}
