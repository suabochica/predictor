// Shared across all three apps — nav chrome, generic states. Namespace: `common`.
export default {
  loading: 'Cargando…',
  header: {
    admin: 'Admin',
    login: 'Iniciar sesión',
    logout: 'Cerrar sesión',
    // {app} is a proper noun (Polla/Fantasy) — never translated, only interpolated.
    goTo: 'Ir a {app}',
  },
  footer: {
    home: 'Inicio',
    lastUpdated: 'Última actualización',
    madeBy: 'Hecho con ❤️ por',
    and: 'y',
  },
  auth: {
    email: 'Correo electrónico',
    emailPlaceholder: 'tu@ejemplo.com',
    password: 'Contraseña',
    passwordPlaceholder: '••••••••',
    displayName: 'Nombre visible',
    displayNamePlaceholder: 'Tu nombre',
    loginButton: 'Iniciar sesión',
    loggingIn: 'Iniciando sesión…',
  },
} as const;
