import { defineConfig } from 'tsup'
import { copyFileSync, mkdirSync } from 'fs'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: false,
  external: ['react', 'react-dom', 'react/jsx-runtime', 'handlebars'],
  treeshake: true,
  minify: true,
  onSuccess: async () => {
    mkdirSync('dist', { recursive: true })
    copyFileSync('src/styles.css', 'dist/styles.css')
  },
})
