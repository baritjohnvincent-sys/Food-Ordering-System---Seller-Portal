import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: Number(process.env.PORT || 3000),
      strictPort: false,
      // Allow specific dev hosts (e.g. ngrok tunnels)
      allowedHosts: [
        'slashing-lucid-retype.ngrok-free.dev',
        'visible-whomever-sprint.ngrok-free.dev',
        'renovator-hardener-dispersed.ngrok-free.dev',
      ],
      hmr: {
        host: '127.0.0.1',
        port: Number(process.env.VITE_HMR_PORT || 24679),
      },
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        ignored: ['**/.env*', '**/.env.*'],
      },
    },
  };
});
