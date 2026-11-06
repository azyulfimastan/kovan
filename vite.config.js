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
            // editor libraries: only loaded when a note is opened
            { name: 'yjs', test: /node_modules[\\/](yjs|lib0|y-protocols|@tiptap[\\/]y-tiptap)[\\/]/ },
            { name: 'tiptap', test: /node_modules[\\/](@tiptap|prosemirror-[\w-]+|linkifyjs|orderedmap|rope-sequence|w3c-keyname)[\\/]/ },
          ],
        },
      },
    },
  },
})
