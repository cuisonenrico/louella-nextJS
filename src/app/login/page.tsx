'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, router]);

  if (isAuthenticated) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      router.replace('/dashboard');
    } catch {
      setError('Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-4xl overflow-hidden rounded-2xl border bg-card shadow-sm md:grid md:grid-cols-[1.1fr_1fr]">
        {/* Brand panel */}
        <div className="relative hidden flex-col justify-between bg-foreground p-10 text-background md:flex">
          <p className="font-display text-2xl font-semibold italic">Louella</p>
          <div>
            <p className="font-display text-3xl font-medium leading-snug">
              The ovens are on before the sun is up.
            </p>
            <p className="mt-4 text-sm text-background/60">
              Inventory, production, and sales for the panaderya.
            </p>
          </div>
          <Link
            href="/"
            className="text-sm text-background/60 underline-offset-4 transition-colors hover:text-background hover:underline"
          >
            ← Back to louellabakery
          </Link>
        </div>

        {/* Form panel */}
        <div className="p-8 sm:p-10">
          <h1 className="font-display text-2xl font-medium">Sign in</h1>
          <p className="mb-6 mt-1 text-sm text-muted-foreground">
            Staff access to the bakery workspace.
          </p>

          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
                placeholder="admin@louella.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Sign In'}
            </Button>
          </form>

          <p className="mt-4 text-sm text-muted-foreground">
            Contact your administrator to create an account.
          </p>
          <Link
            href="/"
            className="mt-2 inline-block text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline md:hidden"
          >
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
