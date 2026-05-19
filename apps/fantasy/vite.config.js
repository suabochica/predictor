import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/fantasy/' : '/',
  plugins: [tailwindcss(), react()],
  optimizeDeps: {
    include: ['@predictor/supabase', '@predictor/ui', '@predictor/types'],
  },
}));
