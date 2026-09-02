// Node/SSR-safe entry — no React. Astro middlewares import from here, so
// `./react` must never be re-exported (it would drag react/react-dom into
// the Netlify Function cold path). Import `@predictor/i18n/react` directly
// for the client-side provider.
export * from './config';
export * from './translate';
export * from './format';
export * from './resolve';
export { CATALOGS, checkCatalogParity } from './catalogs';
