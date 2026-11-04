import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Libraries that rarely change get their own files, so a normal app update
// only re-downloads the small app chunk (the browser keeps the rest cached).
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'supabase', test: /node_modules[\\/](@supabase|tslib|ws)[\\/]/ },
          ],
        },
      },
    },
  },
})
