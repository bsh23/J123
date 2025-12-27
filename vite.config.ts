import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [react()],
    define: {
      // Expose env variables to the client-side code
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
      'process.env.FB_ACCESS_TOKEN': JSON.stringify(env.FB_ACCESS_TOKEN),
      'process.env.FB_PHONE_NUMBER_ID': JSON.stringify(env.FB_PHONE_NUMBER_ID),
      'process.env.FB_VERIFY_TOKEN': JSON.stringify(env.FB_VERIFY_TOKEN),
    },
    build: {
      outDir: 'dist',
      sourcemap: false
    },
    server: {
      port: 3000,
      host: true
    }
  };
});