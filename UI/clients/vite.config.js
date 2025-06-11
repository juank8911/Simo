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
      '/api': {
        target: 'http://localhost:3000', // Backend server runs on port 3000
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
