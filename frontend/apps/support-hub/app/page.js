'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, Card, Button } from '@froncort/ui';
import { Input, Label } from '@froncort/ui';

export default function LoginPage() {
  const { isAuthenticated, loading, login, register } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', name: '', orgName: '' });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && isAuthenticated) router.replace('/dashboard');
  }, [loading, isAuthenticated, router]);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const res =
      mode === 'login' ? await login(form.email, form.password) : await register(form);
    setSubmitting(false);
    if (!res.ok) {
      setError(res.body?.error?.message || 'Something went wrong.');
      return;
    }
    router.replace('/dashboard');
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p className="text-sm text-ink-mute">Checking session…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-2xl font-medium text-ink">Support Hub</h1>
        <p className="mb-6 text-sm text-ink-mute">
          {mode === 'login' ? 'Sign in to your organization workspace.' : 'Create a new organization workspace.'}
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {mode === 'register' && (
            <div>
              <Label>Your name</Label>
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} required />
            </div>
          )}
          <div>
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required />
          </div>
          <div>
            <Label>Password</Label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
              minLength={8}
              required
            />
          </div>
          {mode === 'register' && (
            <div>
              <Label>Organization name</Label>
              <Input value={form.orgName} onChange={(e) => set('orgName', e.target.value)} required />
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create workspace'}
          </Button>
        </form>
        <button
          type="button"
          className="mt-4 text-sm text-ink-mute underline-offset-2 hover:underline"
          onClick={() => {
            setError(null);
            setMode((m) => (m === 'login' ? 'register' : 'login'));
          }}
        >
          {mode === 'login' ? "Don't have a workspace? Register" : 'Already have an account? Sign in'}
        </button>
      </Card>
    </main>
  );
}
