import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  build: {
    // Raise the warning limit slightly since App.jsx is still large
    chunkSizeWarningLimit: 600,

    rollupOptions: {
      output: {
        /**
         * manualChunks — split heavy vendor libs into separate cacheable files.
         *
         * Result (approximate sizes after gzip):
         *   vendor-react    ~45 KB   — rarely changes; long-lived cache
         *   vendor-firebase ~90 KB   — rarely changes
         *   vendor-lucide   ~20 KB   — only grows when new icons are imported
         *   vendor-date     ~15 KB   — date-fns + locale
         *   index           ??? KB   — app code (shrinks as views get extracted)
         */
        manualChunks(id) {
          // React runtime
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'vendor-react'
          }
          // Firebase (all sub-packages)
          if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) {
            return 'vendor-firebase'
          }
          // Lucide icons
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-lucide'
          }
          // date-fns
          if (id.includes('node_modules/date-fns')) {
            return 'vendor-date'
          }
        },
      },
    },
  },

  // Speed up local dev by pre-bundling heavy libs
  optimizeDeps: {
    include: ['react', 'react-dom', 'firebase/app', 'firebase/auth', 'firebase/firestore', 'lucide-react', 'date-fns'],
  },
})
