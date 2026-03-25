import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    define: {
      // Explicitly allowlisted client-side vars only. Never add secrets here.
      'process.env': JSON.stringify({
        API_KEY: env.API_KEY || '',
        HF_TOKEN: env.HF_TOKEN || '',
      }),
      'process.version': JSON.stringify('v16.0.0'),
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        }
      }
    },
    build: {
      target: 'modules',
      outDir: 'dist',
      sourcemap: false
    },
    optimizeDeps: {
      exclude: [],
      include: ['p-retry']
    }
  };
});