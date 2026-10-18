import { useState } from 'react';
import { useRequestStore } from '../../store/requestStore';
import { UrlBar } from './UrlBar';
import { KeyValueEditor } from './KeyValueEditor';
import { BodyEditor } from './BodyEditor';
import { ScriptEditor } from './ScriptEditor';
import { AuthEditor } from './AuthEditor';
import { CommentsEditor } from './CommentsEditor';
import { useSettingsStore } from '../../store/settingsStore';

const TABS = [
  'Params',
  'Authorization',
  'Headers',
  'Body',
  'Pre-request Script',
  'Tests',
  'Comments',
  'Settings',
] as const;

type TabType = typeof TABS[number];

export function RequestEditor() {
  const { activeRequest, updateActiveRequest } = useRequestStore();
  const [activeTab, setActiveTab] = useState<TabType>('Params');
  const globalSettings = useSettingsStore((s) => s.settings);

  if (!activeRequest) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-400 p-8 h-full">
        <p className="mb-4 text-sm">Select a request from the sidebar or start fresh</p>
        <button
          data-testid="create-request-btn"
          onClick={() => useRequestStore.getState().newTab()}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-sm font-medium transition-colors"
        >
          Create a Request
        </button>
      </div>
    );
  }

  // Badge helpers
  const activeParamCount = (activeRequest.params || []).filter(p => p.enabled && p.key).length;
  const activeHeaderCount = (activeRequest.headers || []).filter(h => h.enabled && h.key).length;
  const hasAuth = activeRequest.auth?.type && activeRequest.auth.type !== 'none';
  const hasBody = activeRequest.body?.mode && activeRequest.body.mode !== 'none';
  const hasPreScript = !!activeRequest.preRequestScript?.trim();
  const hasTests = !!activeRequest.testScript?.trim();

  const tabBadge = (tab: TabType): string | null => {
    if (tab === 'Params' && activeParamCount > 0) return String(activeParamCount);
    if (tab === 'Headers' && activeHeaderCount > 0) return String(activeHeaderCount);
    if (tab === 'Authorization' && hasAuth) return '●';
    if (tab === 'Body' && hasBody) return '●';
    if (tab === 'Pre-request Script' && hasPreScript) return '●';
    if (tab === 'Tests' && hasTests) return '●';
    return null;
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      <UrlBar />

      {/* Tabs */}
      <div className="flex overflow-x-auto border-b border-gray-200 dark:border-gray-700 px-4 scrollbar-hide bg-white dark:bg-gray-900">
        {TABS.map((tab) => {
          const badge = tabBadge(tab);
          return (
            <button
              key={tab}
              data-testid={`req-tab-${tab.toLowerCase().replace(/\s+/g, '-')}`}
              onClick={() => setActiveTab(tab)}
              className={`whitespace-nowrap py-3 px-4 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === tab
                  ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:border-gray-300'
              }`}
            >
              {tab}
              {badge && (
                <span className={`text-xs font-mono rounded ${activeTab === tab ? 'text-orange-500' : 'text-gray-400'}`}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4 bg-white dark:bg-gray-900">
        {activeTab === 'Params' && (
          <div className="h-full">
            <KeyValueEditor
              items={activeRequest.params || []}
              onChange={(items) => {
                if ((window as any).__onParamsChange) {
                  (window as any).__onParamsChange(items);
                } else {
                  updateActiveRequest({ params: items });
                }
              }}
            />
          </div>
        )}

        {activeTab === 'Headers' && (
          <div className="h-full flex flex-col gap-2">
            {activeRequest.auth?.type === 'basic' && (
              <div className="flex border border-gray-200 dark:border-gray-700 rounded overflow-hidden opacity-60 bg-gray-50 dark:bg-gray-800">
                <div className="w-1/3 px-3 py-1.5 border-r border-gray-200 dark:border-gray-700 flex items-center">
                  <span className="text-sm">Authorization</span>
                </div>
                <div className="flex-1 px-3 py-1.5 flex items-center">
                  <span className="text-sm text-gray-500 font-mono">Basic {'<computed>'}</span>
                </div>
                <div className="px-3 flex items-center text-xs text-gray-400">Auto-generated</div>
              </div>
            )}
            <KeyValueEditor
              items={activeRequest.headers || []}
              onChange={(items) => updateActiveRequest({ headers: items })}
            />
          </div>
        )}

        {activeTab === 'Body' && (
          <div className="h-full">
            <BodyEditor />
          </div>
        )}

        {activeTab === 'Authorization' && (
          <div className="h-full">
            <AuthEditor />
          </div>
        )}

        {activeTab === 'Pre-request Script' && (
          <div className="h-full flex flex-col gap-2">
            <p className="text-sm text-gray-500 dark:text-gray-400">Write JavaScript code to execute before sending the request.</p>
            <ScriptEditor
              value={activeRequest.preRequestScript || ''}
              onChange={(val) => updateActiveRequest({ preRequestScript: val })}
            />
          </div>
        )}

        {activeTab === 'Tests' && (
          <div className="h-full flex flex-col gap-2">
            <p className="text-sm text-gray-500 dark:text-gray-400">Write JavaScript code to test the response.</p>
            <ScriptEditor
              value={activeRequest.testScript || ''}
              onChange={(val) => updateActiveRequest({ testScript: val })}
            />
          </div>
        )}

        {activeTab === 'Settings' && (() => {
          const rs = activeRequest.settings || {};
          const set = (patch: Record<string, unknown>) => updateActiveRequest({ settings: { ...rs, ...patch } as any });
          const clear = (key: string) => { const next: any = { ...rs }; delete next[key]; updateActiveRequest({ settings: next }); };
          const boolRow = (key: 'followRedirects' | 'verifySsl' | 'encodeUrl', label: string) => {
            const value = (rs as any)[key];
            const global = (globalSettings as any)[key];
            return (
              <div className="flex items-center gap-3 text-sm">
                <label className="w-56 text-gray-700 dark:text-gray-300">{label}</label>
                <select
                  data-testid={`req-setting-${key}`}
                  value={typeof value === 'boolean' ? String(value) : 'default'}
                  onChange={(e) => (e.target.value === 'default' ? clear(key) : set({ [key]: e.target.value === 'true' }))}
                  className="px-2 py-1 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded"
                >
                  <option value="default">Use global setting ({global === false ? 'off' : 'on'})</option>
                  <option value="true">On</option>
                  <option value="false">Off</option>
                </select>
              </div>
            );
          };
          return (
            <div className="flex flex-col gap-3" data-testid="req-settings-panel">
              <p className="text-sm text-gray-500 dark:text-gray-400">Override the global settings for this request only.</p>
              {boolRow('followRedirects', 'Follow redirects')}
              {boolRow('verifySsl', 'Verify SSL certificates')}
              {boolRow('encodeUrl', 'Encode URL automatically')}
              <div className="flex items-center gap-3 text-sm">
                <label className="w-56 text-gray-700 dark:text-gray-300">Request timeout (ms, 0 = none)</label>
                <input
                  type="number"
                  min={0}
                  data-testid="req-setting-timeout"
                  placeholder={`Global: ${globalSettings.timeout ?? 0}`}
                  value={typeof rs.timeout === 'number' ? rs.timeout : ''}
                  onChange={(e) => (e.target.value === '' ? clear('timeout') : set({ timeout: Math.max(0, Math.trunc(Number(e.target.value)) || 0) }))}
                  className="w-40 px-2 py-1 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded"
                />
              </div>
            </div>
          );
        })()}

        {activeTab === 'Comments' && (
          <div className="flex-1 overflow-y-auto">
            <CommentsEditor />
          </div>
        )}
      </div>
    </div>
  );
}
