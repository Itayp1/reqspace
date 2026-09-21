import { useRequestStore } from '../../store/requestStore';

export function RequestSettings() {
  const { activeRequest, updateActiveRequest } = useRequestStore();

  if (!activeRequest) return null;

  const settings = activeRequest.settings || {
    timeout: 30000,
    verifySsl: true,
    followRedirects: true,
  };

  const updateSetting = (key: keyof typeof settings, value: any) => {
    updateActiveRequest({
      settings: { ...settings, [key]: value },
      isDirty: true
    });
  };

  return (
    <div className="p-4 space-y-6 max-w-2xl">
      <div>
        <h3 className="text-sm font-medium mb-4">Request Settings</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Request Timeout (ms)</label>
              <p className="text-xs text-gray-500">Maximum time to wait for a response.</p>
            </div>
            <input
              type="number"
              value={settings.timeout ?? 30000}
              onChange={(e) => updateSetting('timeout', parseInt(e.target.value) || 0)}
              className="w-32 px-3 py-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-orange-500 text-sm"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Enable SSL Certificate Verification</label>
              <p className="text-xs text-gray-500">Verify SSL certificates for HTTPS requests.</p>
            </div>
            <input
              type="checkbox"
              checked={settings.verifySsl ?? true}
              onChange={(e) => updateSetting('verifySsl', e.target.checked)}
              className="w-4 h-4 text-orange-500 rounded border-gray-300 focus:ring-orange-500"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Automatically Follow Redirects</label>
              <p className="text-xs text-gray-500">Follow HTTP 3xx responses.</p>
            </div>
            <input
              type="checkbox"
              checked={settings.followRedirects ?? true}
              onChange={(e) => updateSetting('followRedirects', e.target.checked)}
              className="w-4 h-4 text-orange-500 rounded border-gray-300 focus:ring-orange-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
