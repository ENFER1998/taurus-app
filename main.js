const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: "Taurus Track Pro",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://wa.me/')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    if (parsedUrl.protocol !== 'file:' && !navigationUrl.includes('taurus-cbd59.firebaseapp.com')) {
      event.preventDefault();
    }
  });

  mainWindow.loadFile('pc.html');
}

ipcMain.handle('guardar-reporte-local', async (event, { base64Data, nombreSugerido, extension }) => {
  try {
    if (!mainWindow) throw new Error("Ventana no disponible");

    const nombreLimpio = path.basename(String(nombreSugerido || 'reporte-taurus')).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    const extPermitidas = ['pdf', 'xlsx', 'csv'];
    const extFinal = extPermitidas.includes(extension) ? extension : 'pdf';

    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: "Guardar Reporte Oficial Taurus",
      defaultPath: `${nombreLimpio}.${extFinal}`,
      filters: [{ name: extFinal.toUpperCase(), extensions: [extFinal] }]
    });

    if (canceled || !filePath) return { success: false, reason: 'canceled' };

    const buffer = Buffer.from(base64Data, 'base64');
    await fs.promises.writeFile(filePath, buffer);
    return { success: true, path: filePath };
  } catch (err) {
    console.error("[Electron IPC Save Error]:", err);
    return { success: false, error: err.message };
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
