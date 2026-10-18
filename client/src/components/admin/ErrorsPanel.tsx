import { Fragment, useEffect, useState } from 'react';
import api from '../../api/axios';
import { customConfirm } from '../../utils/dialog';
import { useToastStore } from '../../store/toastStore';

const PAGE_SIZE = 50;
const KINDS = ['window.error', 'unhandledrejection', 'react-boundary', 'api', 'server-exception', 'server-5xx', 'process', 'fork-sync', 'rate-limit', 'audit-log', 'fperrors-purge', 'db-connect'];

interface ErrorGroup {
  fingerprint: string;
  source: string;
  kind: string;
  message: string;
  route: string | null;
  count: number;
  firstSeen: string;
  lastSeen: string;
}

interface ErrorOccurrence {
  id: string;
  message: string;
  stack: string | null;
  componentStack: string | null;
  route: string | null;
  method: string | null;
  status: number | null;
  userId: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface Filters {
  source: string;
  kind: string;
  q: string;
  from: string;
  to: string;
  sort: 'lastSeen' | 'firstSeen' | 'count';
}

const EMPTY_FILTERS: Filters = { source: '', kind: '', q: '', from: '', to: '', sort: 'lastSeen' };

// <input type=date> yields a local calendar day; the API wants instants.
const dayStart = (d: string) => (d ? new Date(`${d}T00:00:00`).toISOString() : undefined);
const dayEnd = (d: string) => (d ? new Date(`${d}T23:59:59.999`).toISOString() : undefined);

export function ErrorsPanel() {
  const addToast = useToastStore((s) => s.addToast);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [draftQuery, setDraftQuery] = useState('');
  const [groups, setGroups] = useState<ErrorGroup[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [openFingerprint, setOpenFingerprint] = useState<string | null>(null);
  const [occurrences, setOccurrences] = useState<ErrorOccurrence[]>([]);

  const fetchGroups = async (active: Filters, offset: number) => {
    setLoading(true);
    try {
      const res = await api.get('/admin/errors', {
        params: {
          source: active.source || undefined,
          kind: active.kind || undefined,
          q: active.q || undefined,
          since: dayStart(active.from),
          until: dayEnd(active.to),
          sort: active.sort,
          limit: PAGE_SIZE,
          offset,
        },
      });
      setGroups((prev) => (offset === 0 ? res.data.groups : [...prev, ...res.data.groups]));
      setHasMore(res.data.hasMore);
    } catch {
      addToast('error', 'Could not load errors');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchGroups(filters, 0);
    setOpenFingerprint(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const applySearch = () => setFilters((prev) => ({ ...prev, q: draftQuery.trim() }));

  const toggleDetails = async (fingerprint: string) => {
    if (openFingerprint === fingerprint) {
      setOpenFingerprint(null);
      return;
    }
    setOpenFingerprint(fingerprint);
    setOccurrences([]);
    try {
      const res = await api.get(`/admin/errors/${fingerprint}`);
      setOccurrences(res.data.items);
    } catch {
      addToast('error', 'Could not load occurrences');
    }
  };

  const markFixed = async (group: ErrorGroup) => {
    const confirmed = await customConfirm(
      'Mark as fixed',
      `Remove all ${group.count} occurrence(s) of this error?`,
      'Remove',
    );
    if (!confirmed) return;
    try {
      await api.delete(`/admin/errors/${group.fingerprint}`);
      setGroups((prev) => prev.filter((g) => g.fingerprint !== group.fingerprint));
      if (openFingerprint === group.fingerprint) setOpenFingerprint(null);
      addToast('success', 'Error removed');
    } catch {
      addToast('error', 'Could not remove the error');
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <select
          className="rounded border border-border bg-surface px-2 py-1 text-sm"
          value={filters.source}
          onChange={(e) => setFilters((prev) => ({ ...prev, source: e.target.value }))}
        >
          <option value="">All sources</option>
          <option value="client">Client</option>
          <option value="server">Server</option>
        </select>
        <select
          className="rounded border border-border bg-surface px-2 py-1 text-sm"
          value={filters.kind}
          onChange={(e) => setFilters((prev) => ({ ...prev, kind: e.target.value }))}
        >
          <option value="">All kinds</option>
          {KINDS.map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
        <input
          type="date"
          data-testid="errors-from"
          aria-label="From date"
          className="rounded border border-border bg-surface px-2 py-1 text-sm"
          value={filters.from}
          onChange={(e) => setFilters((prev) => ({ ...prev, from: e.target.value }))}
        />
        <input
          type="date"
          data-testid="errors-to"
          aria-label="To date"
          className="rounded border border-border bg-surface px-2 py-1 text-sm"
          value={filters.to}
          onChange={(e) => setFilters((prev) => ({ ...prev, to: e.target.value }))}
        />
        <select
          data-testid="errors-sort"
          aria-label="Sort by"
          className="rounded border border-border bg-surface px-2 py-1 text-sm"
          value={filters.sort}
          onChange={(e) => setFilters((prev) => ({ ...prev, sort: e.target.value as Filters['sort'] }))}
        >
          <option value="lastSeen">Sort: last seen</option>
          <option value="firstSeen">Sort: first seen</option>
          <option value="count">Sort: count</option>
        </select>
        <input
          data-testid="errors-search"
          className="min-w-[200px] flex-1 rounded border border-border bg-surface px-2 py-1 text-sm"
          placeholder="Search message..."
          value={draftQuery}
          onChange={(e) => setDraftQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') applySearch(); }}
        />
        <button data-testid="errors-search-btn" className="rounded border border-border px-3 py-1 text-sm hover:bg-surface" onClick={applySearch}>
          Search
        </button>
      </div>

      {!loading && groups.length === 0 && (
        <p className="p-4 text-text-muted">No errors recorded.</p>
      )}

      {groups.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface border-b border-border">
              <tr>
                <th className="p-4">Last seen</th>
                <th className="p-4">Source</th>
                <th className="p-4">Kind</th>
                <th className="p-4">Message</th>
                <th className="p-4">Route</th>
                <th className="p-4">Count</th>
                <th className="p-4" />
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <Fragment key={g.fingerprint}>
                  <tr data-testid="error-row" data-fingerprint={g.fingerprint} className="border-b border-border hover:bg-surface">
                    <td className="p-4 whitespace-nowrap text-text-muted">{new Date(g.lastSeen).toLocaleString()}</td>
                    <td className="p-4">{g.source}</td>
                    <td className="p-4 font-mono text-xs">{g.kind}</td>
                    <td className="p-4 max-w-[400px] truncate" title={g.message}>{g.message}</td>
                    <td className="p-4 font-mono text-xs">{g.route ?? ''}</td>
                    <td className="p-4 font-bold">{g.count}</td>
                    <td className="p-4 whitespace-nowrap">
                      <button data-testid="error-details-btn" className="mr-3 text-primary hover:underline" onClick={() => toggleDetails(g.fingerprint)}>
                        {openFingerprint === g.fingerprint ? 'Hide' : 'Details'}
                      </button>
                      <button data-testid="error-fixed-btn" className="text-red-500 hover:underline" onClick={() => markFixed(g)}>
                        Fixed
                      </button>
                    </td>
                  </tr>
                  {openFingerprint === g.fingerprint && (
                    <tr className="border-b border-border bg-surface">
                      <td colSpan={7} className="p-4">
                        {occurrences.length === 0 && <p className="text-text-muted">Loading...</p>}
                        {occurrences.map((o) => (
                          <div key={o.id} data-testid="error-occurrence" className="mb-4 space-y-1 text-xs">
                            <div className="text-text-muted">
                              {new Date(o.createdAt).toLocaleString()}
                              {o.method && ` · ${o.method}`}
                              {o.status != null && ` · ${o.status}`}
                              {o.route && ` · ${o.route}`}
                              {o.userId && ` · user ${o.userId}`}
                            </div>
                            {o.userAgent && <div className="text-text-muted break-all">{o.userAgent}</div>}
                            {o.stack && <pre className="whitespace-pre-wrap break-all rounded bg-background p-2 font-mono">{o.stack}</pre>}
                            {o.componentStack && <pre className="whitespace-pre-wrap break-all rounded bg-background p-2 font-mono">{o.componentStack}</pre>}
                          </div>
                        ))}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hasMore && (
        <div className="mt-4 text-center">
          <button
            className="rounded border border-border px-4 py-2 text-sm hover:bg-surface"
            disabled={loading}
            onClick={() => fetchGroups(filters, groups.length)}
          >
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
