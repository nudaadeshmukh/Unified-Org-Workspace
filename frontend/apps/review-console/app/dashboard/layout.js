'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, AppShell } from '@froncort/ui';

const NAV_LINKS = [
  { href: '/dashboard', label: 'Pull Requests' },
  { href: '/dashboard/audit', label: 'Audit Log' },
  ...(process.env.NEXT_PUBLIC_SUPPORT_HUB_URL
    ? [{ href: process.env.NEXT_PUBLIC_SUPPORT_HUB_URL, label: 'Open Support Hub →' }]
    : []),
];

export default function DashboardLayout({ children }) {
  const { loading, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isAuthenticated) router.replace('/');
  }, [loading, isAuthenticated, router]);

  if (loading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-ink-mute">Loading…</p>
      </div>
    );
  }

  return (
    <AppShell appName="Review Console" navLinks={NAV_LINKS}>
      {children}
    </AppShell>
  );
}
