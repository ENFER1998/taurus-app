const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

app.commandLine.appendSwitch('enable-web-bluetooth');
app.commandLine.appendSwitch('enable-experimental-web-platform-features');
app.commandLine.appendSwitch('enable-features', 'WebBluetooth,WebBluetoothNewPermissionsBackend');

let mainWindow = null;
let bleSelectCallback = null;
let bleScanTimeout = null;

function limpiarSeleccionBlePendiente(cancelar = false) {
  if (bleScanTimeout) {
    clearTimeout(bleScanTimeout);
    bleScanTimeout = null;
  }
  if (cancelar && typeof bleSelectCallback === 'function') {
    const cb = bleSelectCallback;
    bleSelectCallback = null;
    try { cb(''); } catch (e) {}
  } else if (!cancelar) {
    bleSelectCallback = null;
  }
}

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

  if (mainWindow.webContents.session && typeof mainWindow.webContents.session.setBluetoothPairingHandler === 'function') {
    mainWindow.webContents.session.setBluetoothPairingHandler((details, callback) => {
      callback({ confirmed: true });
    });
  }

  mainWindow.webContents.on('select-bluetooth-device', (event, deviceList, callback) => {
    event.preventDefault();
    bleSelectCallback = callback;

    const lista = Array.isArray(deviceList) ? deviceList : [];

    const dispositivoTaurus = lista.find((d) => {
      const nombre = String(d.deviceName || '').trim();
      return /taurus|track\s*pro|baston|balanza|rfid|esp32|tru[\s-]*test|allflex|uart/i.test(nombre);
    });

    if (dispositivoTaurus) {
      limpiarSeleccionBlePendiente(false);
      console.log(`[Electron BLE] Conectando a: ${dispositivoTaurus.deviceName || dispositivoTaurus.deviceId}`);
      callback(dispositivoTaurus.deviceId);
      return;
    }

    if (!bleScanTimeout) {
      bleScanTimeout = setTimeout(() => {
        if (typeof bleSelectCallback === 'function') {
          const cb = bleSelectCallback;
          bleSelectCallback = null;
          bleScanTimeout = null;

          const conNombre = lista.find((d) => d.deviceName && !/^dispositivo desconocido|unknown/i.test(d.deviceName));
          if (conNombre) {
            try { cb(conNombre.deviceId); } catch (e) {}
          } else {
            try { cb(''); } catch (e) {}
          }
        }
      }, 10000);
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

ipcMain.handle('cancelar-busqueda-ble', async () => {
  limpiarSeleccionBlePendiente(true);
  return { success: true };
});

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
  limpiarSeleccionBlePendiente(true);
  if (process.platform !== 'darwin') app.quit();
});
