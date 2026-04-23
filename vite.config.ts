import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    build: {
      // 벤더 분할: recharts/d3 는 큰 편이라 별도 청크로 분리하여 앱 코드 캐싱 유지
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            if (id.includes('recharts') || id.includes('/d3-') || id.includes('victory-vendor')) {
              return 'recharts';
            }
            if (id.includes('papaparse')) return 'papaparse';
            if (id.includes('react-dom') || id.includes('scheduler')) return 'react';
            if (id.includes('date-fns')) return 'date-fns';
          },
        },
      },
      chunkSizeWarningLimit: 700,
    },
  };
});
