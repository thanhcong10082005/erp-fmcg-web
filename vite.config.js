import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const cacheDir = join(__dirname, '.vite-cache');

export default defineConfig({
    cacheDir,
    plugins: [react()],
    server: {
        port: 5173,
        strictPort: false,
        host: '0.0.0.0',
        proxy: {
            '/api': {
                target: 'http://localhost:3001',
                changeOrigin: true,
            },
        },
    },
    optimizeDeps: {
        // Bỏ qua lock cũ - buộc re-bundle khi dev
        force: true,
    },
});
