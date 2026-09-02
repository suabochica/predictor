import React, { useState } from 'react';
import { supabase } from '@predictor/supabase';
import { createT, type Locale } from '@predictor/i18n';

import { Button } from './Button';
import { Input } from './Input';

interface LoginFormProps {
  redirectTo?: string;
  /** Islands take `lang` as a prop and translate themselves — no provider
   * wraps this component in gateway's Astro page. */
  lang?: Locale;
}

export function LoginForm({ redirectTo = '/', lang = 'es' }: LoginFormProps) {
  const { t } = createT(lang);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    window.location.href = redirectTo;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <div role="alert" className="rounded-sm bg-error/10 px-3 py-2 text-body-sm text-error">
          {error}
        </div>
      )}
      <Input
        id="email"
        type="email"
        label={t('common.auth.email')}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={t('common.auth.emailPlaceholder')}
        required
        disabled={loading}
      />
      <Input
        id="password"
        type="password"
        label={t('common.auth.password')}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={t('common.auth.passwordPlaceholder')}
        required
        disabled={loading}
      />
      <Button type="submit" disabled={loading}>
        {loading ? t('common.auth.loggingIn') : t('common.auth.loginButton')}
      </Button>
    </form>
  );
}
