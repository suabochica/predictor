// Shared across all three apps — nav chrome, generic states. Namespace: `common`.
export default {
  loading: 'Loading…',
  header: {
    admin: 'Admin',
    login: 'Log in',
    logout: 'Log out',
    goTo: 'Go to {app}',
  },
  footer: {
    home: 'Home',
    lastUpdated: 'Last updated',
    madeBy: 'Made with ❤️ by',
    and: 'and',
  },
  auth: {
    email: 'Email',
    emailPlaceholder: 'you@example.com',
    password: 'Password',
    passwordPlaceholder: '••••••••',
    displayName: 'Display name',
    displayNamePlaceholder: 'Your name',
    loginButton: 'Log in',
    loggingIn: 'Logging in…',
  },
} as const;
