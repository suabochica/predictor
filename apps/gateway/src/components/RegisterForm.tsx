import React, { useState } from 'react';
import { supabase } from '@predictor/supabase';
import { Button, Input } from '@predictor/ui';
import { createT, type Locale } from '@predictor/i18n';

export default function RegisterForm({ lang = 'es' }: { lang?: Locale }) {
  const { t } = createT(lang);
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

    const { data, error: signUpError } = await supabase.auth.signUp({ email, password });

    if (signUpError) {
      setError(signUpError.message);
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
      <div className="rounded-md border border-border bg-surface p-5 text-center">
        <p className="text-body-md text-primary">{t('gateway.register.successMessage')}</p>
        <a href="/login" className="mt-4 inline-block text-body-sm text-tertiary hover:underline">{t('gateway.register.backToLogin')}</a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-md border border-border bg-surface p-5">
      {error && (
        <div role="alert" className="rounded-sm bg-error/10 px-3 py-2 text-body-sm text-error">{error}</div>
      )}
      <Input
        id="displayName"
        type="text"
        label={t('common.auth.displayName')}
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        placeholder={t('common.auth.displayNamePlaceholder')}
        required
        disabled={loading}
      />
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
        minLength={6}
        required
        disabled={loading}
      />
      <Button type="submit" disabled={loading}>
        {loading ? t('gateway.register.submitting') : t('gateway.register.submit')}
      </Button>
    </form>
  );
}
