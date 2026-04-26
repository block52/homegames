import { app, BrowserWindow, shell } from "electron";
import { join } from "path";
import { registerIpcHandlers } from "./ipc.js";
import { shutdownServices } from "./services.js";

function createWindow(): BrowserWindow {
    const win = new BrowserWindow({
        width: 1100,
        height: 740,
        minWidth: 760,
        minHeight: 520,
        title: "HomeGames",
        backgroundColor: "#0e0f12",
        webPreferences: {
            preload: join(__dirname, "../preload/index.cjs"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    win.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: "deny" };
    });

    if (process.env.ELECTRON_RENDERER_URL) {
        win.loadURL(process.env.ELECTRON_RENDERER_URL);
    } else {
        win.loadFile(join(__dirname, "../renderer/index.html"));
    }

    return win;
}

app.whenReady().then(() => {
    registerIpcHandlers();
    createWindow();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on("window-all-closed", () => {
    shutdownServices();
    if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
    shutdownServices();
});
