import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
    plugins: [react()],
    define: {
        __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.1.0'),
    },
    build: {
        rollupOptions: {
            output: {
                // A content hash prevents installed PWAs from reusing an obsolete
                // bootstrap bundle after a deployment.
                entryFileNames: 'assets/[name]-[hash].js',
                assetFileNames: function (assetInfo) { return assetInfo.name === 'index.css'
                    ? 'assets/index.css'
                    : 'assets/[name]-[hash][extname]'; },
                manualChunks: {
                    'react-vendor': ['react', 'react-dom', 'react-router-dom'],
                    'supabase-vendor': ['@supabase/supabase-js'],
                    'motion-vendor': ['framer-motion'],
                },
            },
        },
    },
    server: {
        port: 3000,
        open: true
    }
});
