import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// envDir points at repo root so VITE_* vars come from the single shared .env.
export default defineConfig({
  plugins: [react()],
  envDir: '../../',
  server: { port: 5173, host: true },
})
