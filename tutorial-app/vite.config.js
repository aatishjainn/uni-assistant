import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Standalone Tutorial Mode runs on port 5174 so it never conflicts with the original frontend (5173).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5174 },
});
