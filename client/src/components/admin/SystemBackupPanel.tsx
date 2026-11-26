import { useState } from 'react';
import api from '../../api/axios';
import { apiErrorMessage } from '../../utils/apiError';
import { customConfirm } from '../../utils/dialog';
import { useToastStore } from '../../store/toastStore';

const FIELD = 'w-full p-2 border border-border rounded bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40';
const BTN = 'bg-surface border border-border px-4 py-2 rounded hover:bg-border transition text-sm disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';
const toast = (type: 'success' | 'error', msg: string) => useToastStore.getState().addToast(type, msg);

// The password travels in a header (the body is the raw file); base64 keeps non-ASCII passwords intact.
const pwHeader = (pw: string) => btoa(String.fromCharCode(...new TextEncoder().encode(pw)));

// A failed download comes back as a Blob; read the server's message out of it.
async function errorText(e: any, fallback: string) {
  const data = e?.response?.data;
  if (data instanceof Blob) {
    try { return JSON.parse(await data.text()).message || fallback; } catch { return fallback; }
  }
  return apiErrorMessage(e, fallback);
}

interface Preview { createdAt?: string; counts: Record<string, number>; includesHistory: boolean; hasConfig: boolean; emailConflicts: number }

/** Admin > full-system backup: an encrypted file of everything, and the way back in (also for moving data between environments). */
export function SystemBackupPanel() {
  const [exportPw, setExportPw] = useState('');
  const [includeHistory, setIncludeHistory] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [importPw, setImportPw] = useState('');
  const [mode, setMode] = useState<'replace' | 'merge'>('merge');
  const [applyConfig, setApplyConfig] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);

  const doExport = async () => {
    setBusy(true);
    try {
      const res = await api.post('/admin/system/export', { password: exportPw, includeHistory }, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reqspace-system-${new Date().toISOString().slice(0, 10)}.rqsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast('success', 'Backup downloaded. Keep the password - without it the file cannot be opened.');
    } catch (e) {
      toast('error', await errorText(e, 'Export failed'));
    } finally { setBusy(false); }
  };

  const send = (path: string) => api.post(path, file, { headers: { 'Content-Type': 'application/octet-stream', 'x-transfer-password': pwHeader(importPw) } });

  const doPreview = async () => {
    setBusy(true);
    setPreview(null);
    try {
      setPreview((await send(`/admin/system/import/preview?mode=${mode}`)).data);
    } catch (e) {
      toast('error', await errorText(e, 'Could not read the file'));
    } finally { setBusy(false); }
  };

  const doImport = async () => {
    const warning = mode === 'replace'
      ? 'This DELETES all current users, workspaces, collections and environments and replaces them with the file. You will be signed out and must sign in with an account from the file. This cannot be undone.'
      : 'This adds what the file contains next to the current data. Existing items are kept; accounts with the same email are reused.';
    if (!(await customConfirm(mode === 'replace' ? 'Replace everything?' : 'Merge backup?', warning))) return;
    setBusy(true);
    try {
      await send(`/admin/system/import?mode=${mode}&applyConfig=${applyConfig}`);
      toast('success', 'Import complete. Reloading…');
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      toast('error', await errorText(e, 'Import failed'));
      setBusy(false);
    }
  };

  const total = preview ? Object.values(preview.counts).reduce((a, b) => a + b, 0) : 0;
  return (
    <div className="space-y-8" data-testid="system-backup">
      <p className="text-sm text-text-muted">
        A complete, encrypted copy of this server: users (with password hashes), workspaces, collections, environments including secret values,
        profile variables, share links and, optionally, request history and system settings. Use it to move data to another environment, or back.
        Treat the file like a password vault: it is encrypted with the password you choose, and it is only as safe as that password.
      </p>

      <div className="space-y-3">
        <h3 className="font-semibold text-sm">Export</h3>
        <label className="block text-sm">Password for the file (min 8 characters)
          <input type="password" autoComplete="new-password" data-testid="system-export-password" value={exportPw} onChange={e => setExportPw(e.target.value)} className={`${FIELD} mt-1`} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" data-testid="system-export-history" checked={includeHistory} onChange={e => setIncludeHistory(e.target.checked)} />
          Include request history (can make the file much larger)
        </label>
        <button type="button" data-testid="system-export-btn" className={BTN} disabled={busy || exportPw.length < 8} onClick={doExport}>Download encrypted backup</button>
      </div>

      <div className="space-y-3 border-t border-border pt-6">
        <h3 className="font-semibold text-sm">Import</h3>
        <label className="block text-sm">Backup file
          <input type="file" accept=".rqsx" data-testid="system-import-file" onChange={e => { setFile(e.target.files?.[0] ?? null); setPreview(null); }} className="block mt-1 text-sm" />
        </label>
        <label className="block text-sm">Password of the file
          <input type="password" autoComplete="off" data-testid="system-import-password" value={importPw} onChange={e => { setImportPw(e.target.value); setPreview(null); }} className={`${FIELD} mt-1`} />
        </label>
        <fieldset className="text-sm space-y-1">
          <legend className="font-medium mb-1">How to import</legend>
          <label className="flex items-start gap-2"><input type="radio" name="system-import-mode" data-testid="system-import-merge" checked={mode === 'merge'} onChange={() => { setMode('merge'); setPreview(null); }} />
            <span><b>Merge</b> - add what is missing, keep what exists (accounts are matched by email)</span></label>
          <label className="flex items-start gap-2"><input type="radio" name="system-import-mode" data-testid="system-import-replace" checked={mode === 'replace'} onChange={() => { setMode('replace'); setPreview(null); }} />
            <span><b>Replace everything</b> - make this server exactly like the file (deletes current data)</span></label>
        </fieldset>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" data-testid="system-import-config" checked={applyConfig} onChange={e => setApplyConfig(e.target.checked)} />
          <span>Also apply the file's system settings (sign-in providers, SMTP, proxy, limits). Leave off when moving between environments: they hold URLs and secrets of the source server.</span>
        </label>
        <div className="flex gap-3">
          <button type="button" data-testid="system-import-preview-btn" className={BTN} disabled={busy || !file || importPw.length < 8} onClick={doPreview}>Check file</button>
          <button type="button" data-testid="system-import-btn" className={BTN} disabled={busy || !preview} onClick={doImport}>Import</button>
        </div>
        {preview && (
          <div data-testid="system-import-summary" className="text-sm border border-border rounded p-3 bg-surface space-y-1" role="status">
            <div>File from {preview.createdAt ? new Date(preview.createdAt).toLocaleString() : 'unknown date'}: {total} records.</div>
            <div className="text-text-muted">{Object.entries(preview.counts).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(', ') || 'empty'}</div>
            {mode === 'merge' && preview.emailConflicts > 0 && <div>{preview.emailConflicts} account(s) already exist here and will be reused.</div>}
            {!preview.hasConfig && applyConfig && <div className="text-text-muted">This file has no system settings.</div>}
          </div>
        )}
      </div>
    </div>
  );
}
