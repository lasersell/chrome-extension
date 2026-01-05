import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// MV3 requires stable filenames; manifest.json and background.js are copied from public/.
export default defineConfig({
  plugins: [react()],
  base: "./",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src")
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: path.resolve(__dirname, "popup.html"),
        sidepanel: path.resolve(__dirname, "sidepanel.html")
      }
    }
  }
});
