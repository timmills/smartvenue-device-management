import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,  // Using unused port 5175
    host: true,
    open: false,
    cors: true
  }
})
