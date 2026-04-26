import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
    main: {
        plugins: [externalizeDepsPlugin()],
        build: {
            outDir: "dist/main",
            lib: {
                entry: resolve(__dirname, "src/main/index.ts"),
                formats: ["cjs"]
            },
            rollupOptions: {
                output: {
                    entryFileNames: "[name].cjs"
                }
            }
        }
    },
    preload: {
        plugins: [externalizeDepsPlugin()],
        build: {
            outDir: "dist/preload",
            lib: {
                entry: resolve(__dirname, "src/preload/index.ts"),
                formats: ["cjs"]
            },
            rollupOptions: {
                output: {
                    entryFileNames: "[name].cjs"
                }
            }
        }
    },
    renderer: {
        root: resolve(__dirname, "src/renderer"),
        plugins: [react()],
        build: {
            outDir: resolve(__dirname, "dist/renderer"),
            rollupOptions: {
                input: resolve(__dirname, "src/renderer/index.html")
            }
        }
    }
});
