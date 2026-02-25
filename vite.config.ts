import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
  // IMPORTANT: Do NOT use loadEnv + spread (...env) here.
  // loadEnv with prefix '' loads ALL environment variables, and JSON.stringify-ing
  // them into define() inlines every secret (GITHUB_TOKEN, etc.) into the client bundle.
  // Only explicitly expose the vars the browser actually needs.
  const HF_TOKEN = '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';

  return {
    plugins: [react()],
    define: {
      // Explicitly allowlisted client-side vars only. Never add secrets here.
      'process.env': JSON.stringify({
        API_KEY: process.env.API_KEY || '',
        HF_TOKEN: HF_TOKEN,
      }),
      'process.version': JSON.stringify('v16.0.0'),
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