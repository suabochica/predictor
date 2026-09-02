// Namespace: `gateway`. The Premiación prose itself is NOT here — it's parallel
// locale components (Premiacion.es.astro / Premiacion.en.astro), per the plan's
// decision to keep rich-text prose out of key extraction.
export default {
  home: {
    title: 'Home',
    welcome: 'Welcome',
    subtitle: 'Choose a prediction mode to continue',
    pollaDescription: 'Predict World Cup results and climb the leaderboard',
    fantasyDescription: 'Sign players, manage your squad and top the leaderboard',
    premiacionHeading: 'Prizes',
  },
  login: {
    title: 'Log in',
    subtitle: 'Log in to make your predictions',
    noAccountPrompt: "Don't have an account?",
    registerLink: 'Sign up',
  },
  register: {
    title: 'Sign up',
    heading: 'Create account',
    subtitle: 'Join the World Cup 2026 prediction league',
    hasAccountPrompt: 'Already have an account?',
    submit: 'Create account',
    submitting: 'Creating account…',
    successMessage: 'Check your email to confirm your account.',
    backToLogin: 'Back to log in',
  },
} as const;
