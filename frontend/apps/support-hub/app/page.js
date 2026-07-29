import { Button, Card } from '@froncort/ui';

// Shell only — no real auth wired until Phase 7.
export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-2xl font-medium text-ink">Support Hub</h1>
        <p className="mb-6 text-sm text-ink-mute">Sign in to your organization workspace.</p>
        <form className="flex flex-col gap-3">
          <input
            type="email"
            placeholder="Email"
            disabled
            className="rounded-sm border border-hairline px-3 py-2 text-sm"
          />
          <input
            type="password"
            placeholder="Password"
            disabled
            className="rounded-sm border border-hairline px-3 py-2 text-sm"
          />
          <Button type="button" disabled>
            Sign in (Phase 7)
          </Button>
        </form>
      </Card>
    </main>
  );
}
