import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');
  // Ensure token is available
  const HF_TOKEN = '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';

  return {
    plugins: [react()],
    define: {
      // Robustly define process.env for the browser
      'process.env': JSON.stringify({
        ...env,
        HF_TOKEN: HF_TOKEN,
        API_KEY: process.env.API_KEY || env.API_KEY || '' 
      }),
      'process.version': JSON.stringify('v16.0.0'),
    },
    build: {
      // Default build target is safer for broad compatibility
      target: 'modules',
      outDir: 'dist',
      sourcemap: false
    },
    // Exclude CDN dependencies from optimization to prevent errors
    optimizeDeps: {
      exclude: ['pdfjs-dist'],
      include: ['p-retry']
    }
  };
});