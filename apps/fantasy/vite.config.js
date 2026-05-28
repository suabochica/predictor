import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(() => ({
  base: process.env.VITE_BASE_PATH ?? '/fantasy/',
  plugins: [tailwindcss(), react()],
  optimizeDeps: {
    include: ['@predictor/supabase', '@predictor/ui', '@predictor/types'],
  },
}));
