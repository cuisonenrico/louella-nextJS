'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { authApi } from '@/lib/apiServices';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, ShieldCheck } from 'lucide-react';

export default function ChangePasswordPage() {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [isLoading, user, router]);

  if (isLoading || !user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (next !== confirm) { setError('Passwords do not match.'); return; }
    if (next.length < 8) { setError('New password must be at least 8 characters.'); return; }
    if (next === current) { setError('New password must differ from the current password.'); return; }
    setSubmitting(true);
    try {
      await authApi.changePassword(current, next);
      setSuccess(true);
      setTimeout(() => router.replace('/dashboard'), 1500);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Failed to change password.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-[420px]">
        <CardContent className="p-8">
          <div className="flex flex-col items-center mb-6">
            <div className="bg-primary/10 rounded-full p-3 mb-3">
              <ShieldCheck className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-xl font-extrabold">Change Password Required</h1>
            <p className="text-sm text-muted-foreground text-center mt-1">
              Your account requires a password change before continuing.
            </p>
          </div>

          {success ? (
            <Alert>
              <AlertDescription className="text-center font-semibold">
                Password changed successfully. Redirecting…
              </AlertDescription>
            </Alert>
          ) : (
            <>
              {error && (
                <Alert variant="destructive" className="mb-4">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="current">Current Password</Label>
                  <Input
                    id="current"
                    type="password"
                    required
                    value={current}
                    onChange={(e) => setCurrent(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="next">New Password</Label>
                  <Input
                    id="next"
                    type="password"
                    required
                    value={next}
                    onChange={(e) => setNext(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm">Confirm New Password</Label>
                  <Input
                    id="confirm"
                    type="password"
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                <Button type="submit" className="w-full" size="lg" disabled={submitting}>
                  {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Change Password'}
                </Button>
              </form>
              <Button variant="ghost" className="w-full mt-2 text-muted-foreground" onClick={() => logout()}>
                Sign out instead
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
