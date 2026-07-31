'use client';

import { useEffect, useState } from 'react';
import { useAuth, AuditFilterBar, AuditLogTable } from '@froncort/ui';

// "OA, REV (own org only)" per api_reference.md — orgId is ALWAYS forced to
// the caller's own org server-side, so no org-picker is needed or offered
// here; this screen just reflects the org switcher's current org, same as
// Support Hub's connections page.
export default function AuditLogPage() {
  const { apiFetch, activeOrgId, orgRole } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({});
  const [exporting, setExporting] = useState(false);
  const canView = orgRole === 'ORG_ADMIN' || orgRole === 'REVIEWER';

  // AuditFilterBar's onChange sets cleared fields to `undefined` (not
  // omitted) — URLSearchParams would otherwise stringify those to the
  // literal text "undefined" and fail the backend's zod validation, so
  // undefined/empty values are dropped before the params object is built,
  // not filtered out afterward.
  function buildQuery(extra = {}) {
    const combined = { ...filters, ...extra };
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(combined)) {
      if (value) params.set(key, value);
    }
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  }

  async function load() {
    if (!activeOrgId || !canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const res = await apiFetch('audit', `/audit-log${buildQuery()}`);
    if (res.ok) setRows(res.body.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrgId, canView, filters]);

  // Downloaded via apiFetch (not a plain <a href>/window.open) because
  // audit-service is Bearer-token-only, not cookie-authenticated — a direct
  // navigation would carry no Authorization header and 401. Fetches the CSV
  // as a blob through the same authenticated/refresh-aware path as every
  // other request, then triggers the browser download from an object URL.
  async function handleExportCsv() {
    if (exporting) return;
    setExporting(true);
    const res = await apiFetch('audit', `/audit-log${buildQuery({ format: 'csv' })}`, { responseType: 'blob' });
    setExporting(false);
    if (!res.ok || !res.blob) return;
    const url = URL.createObjectURL(res.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audit-log.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-medium text-ink">Unified Audit Log</h1>
      {!canView && <p className="text-sm text-ink-faint">Only your org's admin or reviewers can view the audit log.</p>}
      {canView && (
        <>
          <AuditFilterBar
            filters={filters}
            onChange={setFilters}
            onExportCsv={handleExportCsv}
          />
          {loading && <p className="text-sm text-ink-faint">Loading audit log…</p>}
          {!loading && <AuditLogTable rows={rows} />}
        </>
      )}
    </div>
  );
}
