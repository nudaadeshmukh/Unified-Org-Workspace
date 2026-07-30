'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from './auth/AuthContext';

export default function OrgSwitcher() {
  const { memberships, activeOrgId, switchOrg, isPlatformAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const active = memberships.find((m) => m.orgId === activeOrgId);

  if (isPlatformAdmin && memberships.length === 0) {
    return <span className="text-xs text-ink-mute">Platform Super Admin</span>;
  }

  async function handleSwitch(orgId) {
    if (orgId === activeOrgId) {
      setOpen(false);
      return;
    }
    setSwitching(true);
    await switchOrg(orgId);
    setSwitching(false);
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={switching}
        className="flex items-center gap-2 rounded-sm border border-hairline px-3 py-1.5 text-sm text-ink hover:bg-canvas-soft disabled:opacity-50"
      >
        <span className="max-w-[12rem] truncate">{active ? active.orgName : 'Select organization'}</span>
        <span className="text-ink-faint">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-56 rounded-sm border border-hairline bg-canvas py-1 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          {memberships.map((m) => (
            <button
              key={m.orgId}
              type="button"
              onClick={() => handleSwitch(m.orgId)}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-canvas-soft ${
                m.orgId === activeOrgId ? 'text-ink font-medium' : 'text-ink-mute'
              }`}
            >
              <span className="truncate">{m.orgName}</span>
              <span className="ml-2 shrink-0 text-xs text-ink-faint">{m.role}</span>
            </button>
          ))}
          {memberships.length === 0 && <div className="px-3 py-2 text-sm text-ink-faint">No organizations</div>}
        </div>
      )}
    </div>
  );
}
