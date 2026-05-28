import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import netlify from '@astrojs/netlify';

export default defineConfig({
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    server: {
      proxy: {
        '/polla': 'http://localhost:4322',
        '/fantasy': 'http://localhost:4323',
      },
    },
  },
  output: 'server',
  adapter: netlify(),
});
