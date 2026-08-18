import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  build: { outDir: "build" },
  plugins: [react()],

  assetsInclude: ["**/*.md"],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@site": path.resolve(__dirname),
    },
  },
});
