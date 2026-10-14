import { defineConfig } from "vite";

export default defineConfig({
  server: {
    watch: {
      // Rust 源码由 Tauri 监听，避免 Vite 扫描 Cargo 产物而阻塞前端启动。
      ignored: ["**/src-tauri/**"],
    },
  },
});
