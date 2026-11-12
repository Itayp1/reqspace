import { useEffect, useState } from 'react';
import api from '../../api/axios';

type SecretName = 'JWT_SECRET' | 'CERT_ENCRYPTION_KEY';
type Status = Record<SecretName, boolean>;

const DESCRIPTIONS: Record<SecretName, string> = {
  JWT_SECRET: 'Signs login sessions. Nobody can sign in until it is set.',
  CERT_ENCRYPTION_KEY: 'Encrypts the credentials stored in Settings (OAuth, SMTP, proxy, certificates).',
};
const BYTES: Record<SecretName, number> = { JWT_SECRET: 48, CERT_ENCRYPTION_KEY: 32 };

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Shown on the login page while a required secret is missing. Generate creates the value in this
// browser; nothing is sent to the server. Copy the line into the server's environment variables and restart it.
export default function SecretsSetup() {
  const [status, setStatus] = useState<Status | null>(null);
  const [generated, setGenerated] = useState<Partial<Record<SecretName, string>>>({});

  useEffect(() => {
    api.get<Status>('/bootstrap/status').then((res) => setStatus(res.data)).catch(() => setStatus(null));
  }, []);

  if (!status) return null;
  const missing = (Object.keys(status) as SecretName[]).filter((name) => !status[name]);
  if (missing.length === 0) return null;

  return (
    <div data-testid="secrets-setup" className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      {missing.map((name) => {
        const line = generated[name] ? `${name}=${generated[name]}` : null;
        return (
          <div key={name} className="mb-2 last:mb-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold">{name} is not set</div>
                <div>{DESCRIPTIONS[name]}</div>
              </div>
              {!line && (
                <button
                  type="button"
                  data-testid={`generate-${name}`}
                  onClick={() => setGenerated((g) => ({ ...g, [name]: randomHex(BYTES[name]) }))}
                  className="shrink-0 rounded bg-amber-600 px-2 py-1 text-white hover:bg-amber-700"
                >
                  Generate
                </button>
              )}
            </div>
            {line && (
              <div data-testid={`generated-${name}`} className="mt-2">
                <div>Add this to the server&apos;s environment variables, then restart the server:</div>
                <code className="mt-1 block break-all rounded bg-white p-2 font-mono text-xs select-all">{line}</code>
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(line)}
                  className="mt-1 rounded border border-amber-400 px-2 py-0.5 text-xs hover:bg-amber-100"
                >
                  Copy
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
