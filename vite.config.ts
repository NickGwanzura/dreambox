import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      build: {
        // Keep heavyweight optional capabilities out of the main application
        // chunk so first login/dashboard loads stay small.
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (!id.includes('node_modules')) return;
              if (id.includes('recharts')) return 'vendor-charts';
              if (id.includes('leaflet')) return 'vendor-maps';
              if (id.includes('jspdf')) return 'vendor-pdf';
              if (id.includes('html2canvas')) return 'vendor-canvas';
              if (id.includes('pdfkit')) return 'vendor-pdfkit';
              if (id.includes('@google/genai') || id.includes('groq-sdk')) return 'vendor-ai';
              if (id.includes('@aws-sdk')) return 'vendor-storage';
              if (id.includes('lucide-react')) return 'vendor-icons';
              if (id.includes('zod')) return 'vendor-validation';
              if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/') || id.includes('/node_modules/scheduler/')) return 'vendor-react';
              return 'vendor';
            },
          },
        },
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      test: {
        environment: 'node',
        globals: true,
        include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
        coverage: {
          reporter: ['text', 'html'],
          include: ['utils/**', 'services/**'],
        },
      },
    };
});
