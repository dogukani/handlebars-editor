import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Config for testing the built package (dist)
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'handlebars-editor-react/styles.css': resolve(__dirname, '../dist/styles.css'),
      'handlebars-editor-react': resolve(__dirname, '../dist/index.js'),
    },
  },
})
