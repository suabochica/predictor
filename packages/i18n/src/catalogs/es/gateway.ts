// Namespace: `gateway`. The Premiación prose itself is NOT here — it's parallel
// locale components (Premiacion.es.astro / Premiacion.en.astro), per the plan's
// decision to keep rich-text prose out of key extraction.
export default {
  home: {
    title: 'Inicio',
    welcome: 'Bienvenido',
    subtitle: 'Elige una modalidad de predicción para continuar',
    pollaDescription: 'Predice los resultados del Mundial y sube en la clasificación',
    fantasyDescription: 'Ficha jugadores, gestiona tu plantilla y domina la clasificación',
    premiacionHeading: 'Premiación',
  },
  login: {
    title: 'Iniciar sesión',
    subtitle: 'Inicia sesión para hacer tus predicciones',
    noAccountPrompt: '¿No tienes cuenta?',
    registerLink: 'Registrarse',
  },
  register: {
    title: 'Registrarse',
    heading: 'Crear cuenta',
    subtitle: 'Únete a la liga de predicciones del Mundial 2026',
    hasAccountPrompt: '¿Ya tienes cuenta?',
    submit: 'Crear cuenta',
    submitting: 'Creando cuenta…',
    successMessage: 'Revisa tu correo para confirmar tu cuenta.',
    backToLogin: 'Volver al inicio de sesión',
  },
} as const;
