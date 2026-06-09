import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3002,
    proxy: {
      '/api': {
        target: 'http://localhost:4040',
        changeOrigin: true,
        secure: false,
        // Do NOT rewrite — the NestJS API global prefix is already 'api',
        // so /api/auth/login → http://localhost:4040/api/auth/login ✓
      },
      // Local disk uploads (when Cloudinary server keys are unset) — same-origin for <img>
      '/uploads': {
        target: 'http://localhost:4040',
        changeOrigin: true,
        secure: false,
      },
    }
  }
});
