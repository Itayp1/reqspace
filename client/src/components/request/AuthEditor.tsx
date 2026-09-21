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

export function AuthEditor() {
  const { activeRequest, updateActiveRequest } = useRequestStore();
  const [showToken, setShowToken] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  if (!activeRequest) return null;

  const auth = activeRequest.auth || { type: 'none' };

  const update = (partial: Partial<RequestAuth>) => {
    updateActiveRequest({ auth: { ...auth, ...partial } });
  };

  return (
    <div className="flex flex-col gap-4 p-1">
      {/* Type selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-600 dark:text-gray-400 w-20 shrink-0">Type</label>
        <select
          className="border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 outline-none focus:border-orange-400"
          value={auth.type}
          onChange={e => update({ type: e.target.value as RequestAuth['type'] })}
        >
          {AUTH_TYPES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* None */}
      {auth.type === 'none' && (
        <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400">
          This request does not use any authorization. You can set an authorization type using the dropdown above.
        </div>
      )}

      {/* Bearer Token */}
      {auth.type === 'bearer' && (
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-600 dark:text-gray-400 w-20 shrink-0">Token</label>
          <div className="flex-1 relative">
            <input
              type={showToken ? 'text' : 'password'}
              className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 outline-none focus:border-orange-400 font-mono pr-9"
              placeholder="Enter token..."
              value={auth.bearer?.token || ''}
              onChange={e => update({ bearer: { token: e.target.value } })}
            />
            <button
              type="button"
              onClick={() => setShowToken(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showToken ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>
      )}

      {/* Basic Auth */}
      {auth.type === 'basic' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400 w-20 shrink-0">Username</label>
            <input
              type="text"
              className="flex-1 border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 outline-none focus:border-orange-400"
              placeholder="Enter username..."
              value={auth.basic?.username || ''}
              onChange={e => update({ basic: { username: e.target.value, password: auth.basic?.password || '' } })}
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400 w-20 shrink-0">Password</label>
            <div className="flex-1 relative">
              <input
                type={showPassword ? 'text' : 'password'}
                className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 outline-none focus:border-orange-400 pr-9"
                placeholder="Enter password..."
                value={auth.basic?.password || ''}
                onChange={e => update({ basic: { username: auth.basic?.username || '', password: e.target.value } })}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 ml-23">
            Credentials are encoded as Base64 and sent as an <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">Authorization</code> header.
          </p>
        </div>
      )}

      {/* API Key */}
      {auth.type === 'apikey' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400 w-20 shrink-0">Key</label>
            <input
              type="text"
              className="flex-1 border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 outline-none focus:border-orange-400"
              placeholder="e.g. X-API-Key"
              value={auth.apikey?.key || ''}
              onChange={e => update({ apikey: { key: e.target.value, value: auth.apikey?.value || '', in: auth.apikey?.in || 'header' } })}
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400 w-20 shrink-0">Value</label>
            <input
              type="text"
              className="flex-1 border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 outline-none focus:border-orange-400 font-mono"
              placeholder="Enter API key value..."
              value={auth.apikey?.value || ''}
              onChange={e => update({ apikey: { key: auth.apikey?.key || '', value: e.target.value, in: auth.apikey?.in || 'header' } })}
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400 w-20 shrink-0">Add to</label>
            <div className="flex gap-3">
              {(['header', 'query'] as const).map(opt => (
                <label key={opt} className="flex items-center gap-1.5 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="radio"
                    name="apikey-in"
                    value={opt}
                    checked={(auth.apikey?.in || 'header') === opt}
                    onChange={() => update({ apikey: { key: auth.apikey?.key || '', value: auth.apikey?.value || '', in: opt } })}
                    className="accent-orange-500"
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
        <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400">
          This request will inherit authorization from its parent folder or collection.
        </div>
      )}

      {/* OAuth 2.0 */}
      {auth.type === 'oauth2' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400 w-32 shrink-0">Access Token</label>
            <input
              type="text"
              className="flex-1 border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 outline-none focus:border-orange-400 font-mono"
              placeholder="Token"
              value={auth.oauth2?.token || ''}
              onChange={e => update({ oauth2: { ...auth.oauth2, token: e.target.value } })}
            />
          </div>
          <div className="mt-2 text-xs text-gray-500">
            More OAuth 2.0 configuration (Client ID, Auth URL, etc.) can be managed via pre-request scripts or by fetching the token manually for now.
          </div>
        </div>
      )}

      {/* NTLM Auth */}
      {auth.type === 'ntlm' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400 w-24 shrink-0">Username</label>
            <input
              type="text"
              className="flex-1 border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 outline-none focus:border-orange-400"
              value={auth.ntlm?.username || ''}
              onChange={e => update({ ntlm: { ...auth.ntlm, username: e.target.value } })}
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400 w-24 shrink-0">Password</label>
            <input
              type="password"
              className="flex-1 border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 outline-none focus:border-orange-400"
              value={auth.ntlm?.password || ''}
              onChange={e => update({ ntlm: { ...auth.ntlm, password: e.target.value } })}
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400 w-24 shrink-0">Domain</label>
            <input
              type="text"
              className="flex-1 border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 outline-none focus:border-orange-400"
              value={auth.ntlm?.domain || ''}
              onChange={e => update({ ntlm: { ...auth.ntlm, domain: e.target.value } })}
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400 w-24 shrink-0">Workstation</label>
            <input
              type="text"
              className="flex-1 border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 outline-none focus:border-orange-400"
              value={auth.ntlm?.workstation || ''}
              onChange={e => update({ ntlm: { ...auth.ntlm, workstation: e.target.value } })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
