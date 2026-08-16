import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// BASE_PATH lets this build for a GitHub Pages *project* site, where the
// site is served from https://username.github.io/repo-name/ instead of
// the domain root. The deploy workflow sets this automatically to
// "/repo-name/". Locally (npm run dev) it defaults to "/".
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH || '/',
})
