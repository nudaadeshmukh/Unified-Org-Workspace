import './globals.css';
import { AuthProvider } from '@froncort/ui';

export const metadata = {
  title: 'Review & Audit Console — Froncort',
  description: 'PR review and unified audit trail for the Froncort Unified Org Workspace',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-canvas text-ink">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
