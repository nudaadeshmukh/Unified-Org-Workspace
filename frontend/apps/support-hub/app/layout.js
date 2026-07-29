import './globals.css';

export const metadata = {
  title: 'Support Hub — Froncort',
  description: 'Ticketing dashboard for the Froncort Unified Org Workspace',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-canvas text-ink">{children}</body>
    </html>
  );
}
