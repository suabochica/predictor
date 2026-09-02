import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(() => ({
  base: '/fantasy/',
  plugins: [tailwindcss(), react()],
  optimizeDeps: {
    exclude: ['@predictor/supabase', '@predictor/ui', '@predictor/types', '@predictor/i18n'],
  },
}));
