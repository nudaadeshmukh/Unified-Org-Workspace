'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from './auth/AuthContext';

export default function NotificationBell() {
  const { apiFetch } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  async function load() {
    const res = await apiFetch('audit', '/notifications');
    if (res.ok) setNotifications(res.body.data);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  async function markRead(id) {
    const res = await apiFetch('audit', `/notifications/${id}/read`, { method: 'PATCH' });
    if (res.ok) setNotifications((prev) => prev.map((n) => (n.id === id ? res.body.data : n)));
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) load();
        }}
        className="relative rounded-sm border border-hairline px-2.5 py-1.5 text-sm text-ink hover:bg-canvas-soft"
        aria-label="Notifications"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-ink">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 max-h-96 w-80 overflow-y-auto rounded-sm border border-hairline bg-canvas py-1 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          {notifications.length === 0 && <div className="px-3 py-4 text-center text-sm text-ink-faint">No notifications yet</div>}
          {notifications.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => !n.read && markRead(n.id)}
              className={`block w-full border-b border-hairline-cool px-3 py-2 text-left text-sm last:border-b-0 hover:bg-canvas-soft ${
                n.read ? 'text-ink-mute' : 'text-ink font-medium'
              }`}
            >
              <p className="text-xs font-medium text-ink-mute">{n.title}</p>
              <p className="whitespace-pre-wrap">{n.body}</p>
              <p className="mt-1 text-xs text-ink-faint">{new Date(n.createdAt).toLocaleString()}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
