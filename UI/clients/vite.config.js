import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Simple plugin to log server URL on start
const logServerUrl = () => ({
  name: 'log-server-url',
  configureServer(server) {
    server.httpServer.on('listening', () => {
      const { address, port } = server.httpServer.address();
      const url = `http://${address === '::' ? 'localhost' : address}:${port}`;
      console.log(`  > App running at: ${url}`);
    });
  },
});

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), logServerUrl()],
  server: {
    port: 3030,
    proxy: {
      '/api/v_dos': { // Proxy for V2 Python backend (model training, etc.)
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/v_dos/, '/api') // Rewrite /api/v_dos to /api for the backend on 8080
      },
      '/api': { // Existing proxy for Node.js backend (Sebo)
        target: 'http://localhost:3000', // Backend server runs on port 3000
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
