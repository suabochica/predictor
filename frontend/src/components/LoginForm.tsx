import { useState } from 'react';
import type { AuthUser, LoginCredentials } from '../types';

const API_URL = import.meta.env.PUBLIC_API_URL || 'http://localhost:8000';

interface LoginFormProps {
  onLoginSuccess?: (user: AuthUser) => void;
}

export default function LoginForm({ onLoginSuccess }: LoginFormProps = {}) {
  const [credentials, setCredentials] = useState<LoginCredentials>({
    username: '',
    password: '',
  });
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setCredentials((prev) => ({ ...prev, [name]: value }));
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'User not found');
      }

      const user: AuthUser = await response.json();

      // Store user in localStorage
      localStorage.setItem('worldCupUser', JSON.stringify(user));

      // Call optional callback
      if (onLoginSuccess) {
        onLoginSuccess(user);
      }

      // Redirect to home page
      window.location.href = '/';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'User not found');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form class="login-form" onSubmit={handleSubmit}>
      {error && (
        <div class="toast toast-error">
          <span class="toast-icon">⚠️</span>
          <span class="toast-message">{error}</span>
        </div>
      )}

      <div class="form-group">
        <label for="username">Username</label>
        <input
          type="text"
          id="username"
          name="username"
          value={credentials.username}
          onChange={handleChange}
          placeholder="Enter your username"
          required
          disabled={isLoading}
        />
      </div>

      <div class="form-group">
        <label for="password">Password</label>
        <input
          type="password"
          id="password"
          name="password"
          value={credentials.password}
          onChange={handleChange}
          placeholder="Enter your password"
          required
          disabled={isLoading}
        />
      </div>

      <button type="submit" class="login-button" disabled={isLoading}>
        {isLoading ? 'Signing in...' : 'Sign In'}
      </button>
    </form>
  );
}