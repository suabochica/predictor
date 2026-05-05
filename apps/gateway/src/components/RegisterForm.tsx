import React, { useState } from 'react';
import { supabase } from '@predictor/supabase';

export default function RegisterForm() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      await supabase.from('users').insert({ id: data.user.id, email, display_name: displayName });
    }

    setSuccess(true);
    setLoading(false);
  }

  if (success) {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-6 text-center">
        <p className="text-[var(--color-text-heading)]">Check your email to confirm your account.</p>
        <a href="/login" className="mt-4 inline-block text-sm text-[var(--color-accent)] hover:underline">Back to login</a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-6">
      {error && (
        <div className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor="displayName" className="text-sm font-medium text-[var(--color-text-heading)]">Display name</label>
        <input
          id="displayName"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Your name"
          required
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text-heading)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium text-[var(--color-text-heading)]">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text-heading)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium text-[var(--color-text-heading)]">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          minLength={6}
          required
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text-heading)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {loading ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  );
}
