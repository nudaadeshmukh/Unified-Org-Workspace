'use client';

import { useAuth } from './auth/AuthContext';
import OrgSwitcher from './OrgSwitcher';
import NotificationBell from './NotificationBell';
import Button from './Button';

/**
 * nav-bar-light per frontend_reference.md: canvas bg, 16px/24px padding,
 * app name left, primary nav center, session controls right.
 * `navLinks`/`appName` are passed in so this one shell serves both apps
 * (Support Hub, Review Console) without drifting into two styles.
 */
export default function AppShell({ appName, navLinks = [], children }) {
  const { user, orgRole, logout } = useAuth();

  return (
    <div className="min-h-screen bg-canvas">
      <header className="flex items-center justify-between border-b border-hairline bg-canvas px-6 py-4">
        <div className="flex items-center gap-8">
          <span className="text-lg font-medium text-ink">{appName}</span>
          <nav className="flex items-center gap-6">
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} className="text-sm text-ink-mute hover:text-ink">
                {link.label}
              </a>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <OrgSwitcher />
          <NotificationBell />
          <div className="mx-1 hidden text-right sm:block">
            <p className="text-sm text-ink">{user?.name}</p>
            <p className="text-xs text-ink-faint">{orgRole || 'Platform Super Admin'}</p>
          </div>
          <Button variant="secondary" onClick={logout}>
            Log out
          </Button>
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
