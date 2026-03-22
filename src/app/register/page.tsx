'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  TextField,
  Typography,
} from '@mui/material';
import { useAuth } from '@/contexts/AuthContext';

export default function RegisterPage() {
  const { register, isAuthenticated } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
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
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      await register(email, password);
      router.replace('/dashboard');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'Registration failed.';
      setError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 2,
      }}
    >
      <Card sx={{ width: '100%', maxWidth: 420 }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h5" fontWeight={800} mb={0.5} textAlign="center">
            🧁 Louella Bakery
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            textAlign="center"
            mb={3}
          >
            Create a new account
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} noValidate>
            <TextField
              label="Email"
              type="email"
              fullWidth
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              sx={{ mb: 2 }}
              autoComplete="email"
              autoFocus
            />
            <TextField
              label="Password"
              type="password"
              fullWidth
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              sx={{ mb: 2 }}
              autoComplete="new-password"
            />
            <TextField
              label="Confirm Password"
              type="password"
              fullWidth
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              sx={{ mb: 3 }}
              autoComplete="new-password"
            />
            <Button
              type="submit"
              variant="contained"
              fullWidth
              size="large"
              disabled={loading}
            >
              {loading ? <CircularProgress size={22} color="inherit" /> : 'Register'}
            </Button>
          </Box>

          <Typography variant="body2" textAlign="center" mt={2} color="text.secondary">
            Already have an account?{' '}
            <Link href="/login" style={{ color: 'inherit', fontWeight: 600 }}>
              Sign In
            </Link>
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
