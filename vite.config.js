import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  root: "web",
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./web/src", import.meta.url)),
    },
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // 把框架和 UI 库固定在独立 chunk，避免懒加载页面之间出现循环依赖
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("element-plus")) return "ui";
          if (id.includes("/vue/") || id.includes("vue-router") || id.includes("pinia")) {
            return "vendor";
          }
          return "deps";
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:3001",
      "/__proxy": "http://127.0.0.1:3001",
      "/__px": "http://127.0.0.1:3001",
    },
  },
});
