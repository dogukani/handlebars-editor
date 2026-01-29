import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Config for development (uses source files directly)
export default defineConfig({
  plugins: [react()],
  base: '/handlebars-editor/',
  resolve: {
    alias: {
      'handlebars-editor-react/styles.css': resolve(__dirname, '../src/styles.css'),
      'handlebars-editor-react': resolve(__dirname, '../src/index.ts'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
