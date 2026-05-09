import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 5000;

if (rawPort && (Number.isNaN(port) || port <= 0)) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? "/";

function apkMimePlugin() {
  return {
    name: "apk-mime",
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        if (req.url && /\.apk(\?|$)/i.test(req.url)) {
          res.setHeader("Content-Type", "application/vnd.android.package-archive");
        }
        next();
      });
    },
    configurePreviewServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        if (req.url && /\.apk(\?|$)/i.test(req.url)) {
          res.setHeader("Content-Type", "application/vnd.android.package-archive");
        }
        next();
      });
    },
  };
}

const apiPort = process.env.API_PORT ?? "3001";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    apkMimePlugin(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom"],
          "vendor-motion": ["framer-motion"],
          "vendor-markdown": ["react-markdown", "remark-gfm"],
          "vendor-query": ["@tanstack/react-query"],
        },
      },
    },
    target: "es2022",
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    watch: {
      ignored: ["**/android/**", "**/dist/**", "**/node_modules/**"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
