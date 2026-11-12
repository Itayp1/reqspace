import { useRequestStore } from '../../store/requestStore';
import type { RequestAuth } from '../../store/requestStore';
import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

const AUTH_TYPES: Array<{ value: RequestAuth['type']; label: string }> = [
  { value: 'inherit', label: 'Inherit auth from parent' },
  { value: 'none', label: 'No Auth' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'basic', label: 'Basic Auth' },
  { value: 'apikey', label: 'API Key' },
  { value: 'oauth2', label: 'OAuth 2.0' },
  { value: 'ntlm', label: 'NTLM Authentication' },
];

/**
 * Drives the active request's auth by default. Pass `value`/`onChange` to
 * reuse the same editor for a collection's or folder's own auth — that's what
 * gives a request set to `inherit` something to inherit from.
 */
export function AuthEditor({ value, onChange, hideInherit }: {
  value?: RequestAuth | null;
  onChange?: (auth: RequestAuth) => void;
  hideInherit?: boolean;
} = {}) {
  const { activeRequest, updateActiveRequest } = useRequestStore();
  const [showToken, setShowToken] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const controlled = onChange !== undefined;
  if (!controlled && !activeRequest) return null;

  const auth = (controlled ? value : activeRequest?.auth) || { type: 'none' };

  const update = (partial: Partial<RequestAuth>) => {
    const next = { ...auth, ...partial } as RequestAuth;
    if (controlled) onChange!(next);
    else updateActiveRequest({ auth: next });
  };

  // A collection has no parent to inherit from, so offering it there would be
  // a dead option.
  const authTypes = hideInherit ? AUTH_TYPES.filter(t => t.value !== 'inherit') : AUTH_TYPES;

  return (
    <div className="flex flex-col gap-4 p-1">
      {/* Type selector */}
      <div className="flex items-center gap-3">
        <label htmlFor="auth-type-select" className="text-sm font-medium text-text-muted w-28 shrink-0">Type</label>
        <select
          id="auth-type-select"
          data-testid="auth-type-select"
          className="border border-border rounded px-3 py-1.5 text-sm bg-background text-text focus-visible:border-primary"
          value={auth.type}
          onChange={e => update({ type: e.target.value as RequestAuth['type'] })}
        >
          {authTypes.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* None */}
      {auth.type === 'none' && (
        <div className="p-4 bg-surface rounded-lg text-sm text-text-muted">
          This request does not use any authorization. You can set an authorization type using the dropdown above.
        </div>
      )}

      {/* Bearer Token */}
      {auth.type === 'bearer' && (
        <div className="space-y-3">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-text-muted w-28 shrink-0">Prefix</label>
          <input
            data-testid="auth-bearer-prefix"
 aria-label="Prefix"
            className="flex-1 border border-border rounded px-3 py-1.5 text-sm bg-background text-text focus-visible:border-primary font-mono"
            placeholder="Bearer"
            value={auth.bearer?.prefix || ''}
            onChange={e => update({ bearer: { token: auth.bearer?.token || '', prefix: e.target.value } })}
          />
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-text-muted w-28 shrink-0">Token</label>
          <div className="flex-1 relative">
            <input
              data-testid="auth-bearer-token"
 aria-label="Token"
              type={showToken ? 'text' : 'password'}
              className="w-full border border-border rounded px-3 py-1.5 text-sm bg-background text-text focus-visible:border-primary font-mono pr-9"
              placeholder="Enter token…" autoComplete="off" spellCheck={false}
              value={auth.bearer?.token || ''}
              onChange={e => update({ bearer: { ...auth.bearer, token: e.target.value } })}
            />
            <button
              type="button"
              onClick={() => setShowToken(v => !v)}
 title={showToken ? 'Hide value' : 'Show value'}
 aria-label={showToken ? 'Hide token' : 'Show token'}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text rounded"
            >
              {showToken ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
            </button>
          </div>
        </div>
        </div>
      )}

      {/* Basic Auth */}
      {auth.type === 'basic' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-text-muted w-28 shrink-0">Username</label>
            <input
              data-testid="auth-basic-username"
 aria-label="Username"
              type="text"
              className="flex-1 border border-border rounded px-3 py-1.5 text-sm bg-background text-text focus-visible:border-primary"
              placeholder="Enter username…" autoComplete="off" spellCheck={false}
              value={auth.basic?.username || ''}
              onChange={e => update({ basic: { username: e.target.value, password: auth.basic?.password || '' } })}
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-text-muted w-28 shrink-0">Password</label>
            <div className="flex-1 relative">
              <input
                data-testid="auth-basic-password"
 aria-label="Password"
                type={showPassword ? 'text' : 'password'}
                className="w-full border border-border rounded px-3 py-1.5 text-sm bg-background text-text focus-visible:border-primary pr-9"
                placeholder="Enter password…" autoComplete="off"
                value={auth.basic?.password || ''}
                onChange={e => update({ basic: { username: auth.basic?.username || '', password: e.target.value } })}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
 title={showPassword ? 'Hide value' : 'Show value'}
 aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text rounded"
              >
                {showPassword ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
              </button>
            </div>
          </div>
          <p className="text-xs text-text-muted ml-31">
            Credentials are encoded as Base64 and sent as an <code className="bg-surface px-1 rounded">Authorization</code> header.
          </p>
        </div>
      )}

      {/* API Key */}
      {auth.type === 'apikey' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-text-muted w-28 shrink-0">Key</label>
            <input
              data-testid="auth-apikey-key"
 aria-label="Key"
              type="text"
              className="flex-1 border border-border rounded px-3 py-1.5 text-sm bg-background text-text focus-visible:border-primary"
              placeholder="e.g. X-API-Key"
              value={auth.apikey?.key || ''}
              onChange={e => update({ apikey: { key: e.target.value, value: auth.apikey?.value || '', in: auth.apikey?.in || 'header' } })}
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-text-muted w-28 shrink-0">Value</label>
            <input
              data-testid="auth-apikey-value"
 aria-label="Value"
              type="text"
              className="flex-1 border border-border rounded px-3 py-1.5 text-sm bg-background text-text focus-visible:border-primary font-mono"
              placeholder="Enter API key value…" autoComplete="off" spellCheck={false}
              value={auth.apikey?.value || ''}
              onChange={e => update({ apikey: { key: auth.apikey?.key || '', value: e.target.value, in: auth.apikey?.in || 'header' } })}
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-text-muted w-28 shrink-0">Add to</label>
            <div className="flex gap-3">
              {(['header', 'query'] as const).map(opt => (
                <label key={opt} className="flex items-center gap-1.5 cursor-pointer text-sm text-text">
                  <input
                    type="radio"
                    data-testid={`auth-apikey-in-${opt}`}
                    name="apikey-in"
                    value={opt}
                    checked={(auth.apikey?.in || 'header') === opt}
                    onChange={() => update({ apikey: { key: auth.apikey?.key || '', value: auth.apikey?.value || '', in: opt } })}
                    className="accent-primary"
                  />
                  {opt === 'header' ? 'Header' : 'Query Param'}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* Inherit Auth */}
      {auth.type === 'inherit' && (
        <div className="p-4 bg-surface rounded-lg text-sm text-text-muted">
          This request will inherit authorization from its parent folder or collection.
        </div>
      )}

      {/* OAuth 2.0 */}
      {auth.type === 'oauth2' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-text-muted w-28 shrink-0">Access Token</label>
            <input
              data-testid="auth-oauth2-token"
 aria-label="Access token"
              type="text"
              className="flex-1 border border-border rounded px-3 py-1.5 text-sm bg-background text-text focus-visible:border-primary font-mono"
              placeholder="Token"
              value={auth.oauth2?.token || ''}
              onChange={e => update({ oauth2: { ...auth.oauth2, token: e.target.value } })}
            />
          </div>
          <div className="text-xs text-text-muted">
            More OAuth 2.0 configuration (Client ID, Auth URL, etc.) can be managed via pre-request scripts or by fetching the token manually for now.
          </div>
        </div>
      )}

      {/* NTLM Auth */}
      {auth.type === 'ntlm' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-text-muted w-28 shrink-0">Username</label>
            <input
              data-testid="auth-ntlm-username"
 aria-label="Username"
              type="text"
              className="flex-1 border border-border rounded px-3 py-1.5 text-sm bg-background text-text focus-visible:border-primary"
              value={auth.ntlm?.username || ''}
              onChange={e => update({ ntlm: { ...auth.ntlm, username: e.target.value } })}
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-text-muted w-28 shrink-0">Password</label>
            <input
              data-testid="auth-ntlm-password"
 aria-label="Password"
              type="password"
              className="flex-1 border border-border rounded px-3 py-1.5 text-sm bg-background text-text focus-visible:border-primary"
              value={auth.ntlm?.password || ''}
              onChange={e => update({ ntlm: { ...auth.ntlm, password: e.target.value } })}
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-text-muted w-28 shrink-0">Domain</label>
            <input
              data-testid="auth-ntlm-domain"
 aria-label="Domain"
              type="text"
              className="flex-1 border border-border rounded px-3 py-1.5 text-sm bg-background text-text focus-visible:border-primary"
              value={auth.ntlm?.domain || ''}
              onChange={e => update({ ntlm: { ...auth.ntlm, domain: e.target.value } })}
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-text-muted w-28 shrink-0">Workstation</label>
            <input
              data-testid="auth-ntlm-workstation"
 aria-label="Workstation"
              type="text"
              className="flex-1 border border-border rounded px-3 py-1.5 text-sm bg-background text-text focus-visible:border-primary"
              value={auth.ntlm?.workstation || ''}
              onChange={e => update({ ntlm: { ...auth.ntlm, workstation: e.target.value } })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
