'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, AppShell } from '@froncort/ui';

const NAV_LINKS = [
  { href: '/dashboard', label: 'Tickets' },
  { href: '/dashboard/connections', label: 'Connections' },
  { href: '/dashboard/flags', label: 'Feature Flags' },
  ...(process.env.NEXT_PUBLIC_REVIEW_CONSOLE_URL
    ? [{ href: process.env.NEXT_PUBLIC_REVIEW_CONSOLE_URL, label: 'Open Review Console →' }]
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
    <AppShell appName="Support Hub" navLinks={NAV_LINKS}>
      {children}
    </AppShell>
  );
}
