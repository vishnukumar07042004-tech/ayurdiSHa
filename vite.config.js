import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { aymStorePlugin } from "./server/storePlugin.js";

export default defineConfig({
  plugins: [react(), aymStorePlugin()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },
  build: {
    // Hashed build output only; public/assets/* (unhashed images) must never land here (vercel.json marks it immutable).
    assetsDir: "assets/app",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/xlsx")) return "xlsx";
          if (id.includes("node_modules/lucide-react")) return "icons";
        },
      },
    },
  },
});
