const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');

app.commandLine.appendSwitch('enable-web-bluetooth');
app.commandLine.appendSwitch('enable-experimental-web-platform-features');
app.commandLine.appendSwitch('enable-features', 'WebBluetooth,WebBluetoothNewPermissionsBackend');

let mainWindow = null;
let bleSelectCallback = null;
let bleScanTimeout = null;

const ALLOWED_EXTERNAL_HOSTS = new Set([
  'taurus-cbd59.firebaseapp.com',
  'taurus-cbd59.web.app'
]);

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

function esRemitenteIpcConfiable(event) {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    if (!event || event.sender !== mainWindow.webContents) return false;
    const senderUrl = event.senderFrame ? event.senderFrame.url : '';
    if (senderUrl && !senderUrl.startsWith('file://')) return false;
    return true;
  } catch (e) {
    return false;
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
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // 1. Bloqueo de permisos sensibles de hardware (excepto Bluetooth y notificaciones)
  if (mainWindow.webContents.session) {
    const ses = mainWindow.webContents.session;

    if (typeof ses.setPermissionRequestHandler === 'function') {
      ses.setPermissionRequestHandler((webContents, permission, callback) => {
        const permitidos = new Set(['notifications', 'bluetooth', 'bluetoothScanning']);
        callback(permitidos.has(permission));
      });
    }

    if (typeof ses.setBluetoothPairingHandler === 'function') {
      ses.setBluetoothPairingHandler((details, callback) => {
        if (!details || !details.deviceId) {
          callback({ confirmed: false });
          return;
        }
        callback({ confirmed: true });
      });
    }

    ses.on('will-download', (event, item) => {
      const rawName = path.basename(String(item.getFilename() || `Reporte_Taurus_${new Date().toISOString().slice(0, 10)}.pdf`));
      const safeName = rawName.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
      const downloadsDir = app.getPath('downloads');
      item.setSaveDialogOptions({
        title: "Guardar Reporte Oficial Taurus",
        defaultPath: path.join(downloadsDir, safeName),
        filters: [
          { name: 'Documentos PDF', extensions: ['pdf'] },
          { name: 'Archivos de Datos', extensions: ['csv', 'xlsx'] }
        ]
      });
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

  // 2. Blindaje de apertura de ventanas externas (solo WhatsApp oficial por HTTPS)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' && parsed.hostname === 'wa.me') {
        shell.openExternal(url);
      }
    } catch (e) {}
    return { action: 'deny' };
  });

  // 3. Blindaje contra navegación maliciosa (validación exacta de hostname, sin bypass por .includes)
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    try {
      const parsedUrl = new URL(navigationUrl);
      const esLocal = parsedUrl.protocol === 'file:';
      const esHostPermitido = parsedUrl.protocol === 'https:' && ALLOWED_EXTERNAL_HOSTS.has(parsedUrl.hostname);
      if (!esLocal && !esHostPermitido) {
        event.preventDefault();
      }
    } catch (e) {
      event.preventDefault();
    }
  });

  mainWindow.loadFile('pc.html');
}

ipcMain.handle('cancelar-busqueda-ble', async (event) => {
  if (!esRemitenteIpcConfiable(event)) return { success: false, error: 'Origen IPC no autorizado' };
  limpiarSeleccionBlePendiente(true);
  return { success: true };
});

ipcMain.handle('guardar-reporte-local', async (event, payload) => {
  try {
    if (!esRemitenteIpcConfiable(event)) {
      throw new Error("Solicitud bloqueada: origen IPC no autorizado.");
    }
    if (!payload || typeof payload !== 'object') {
      throw new Error("Payload inválido.");
    }

    const { base64Data, nombreSugerido, extension } = payload;
    const rawStr = String(base64Data || '');
    // Límite defensivo contra agotamiento de memoria (máx ~25 MB en base64)
    if (!rawStr || rawStr.length > 35 * 1024 * 1024) {
      throw new Error("Tamaño de reporte inválido o excede el límite seguro.");
    }

    const nombreLimpio = path.basename(String(nombreSugerido || 'reporte-taurus'))
      .replace(/[^a-zA-Z0-9_\-\.]/g, '_')
      .replace(/\.(pdf|xlsx|csv)$/i, '')
      .slice(0, 120) || 'reporte-taurus';

    const extPermitidas = new Set(['pdf', 'xlsx', 'csv']);
    const extLower = String(extension || 'pdf').toLowerCase().trim();
    const extFinal = extPermitidas.has(extLower) ? extLower : 'pdf';
    const downloadsDir = app.getPath('downloads');

    const cleanBase64 = rawStr.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    if (extFinal === 'pdf' && buffer.slice(0, 5).toString('ascii') !== '%PDF-') {
      throw new Error("El archivo generado no tiene una firma PDF válida.");
    }

    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: "Guardar Reporte Oficial Taurus",
      defaultPath: path.join(downloadsDir, `${nombreLimpio}.${extFinal}`),
      filters: [{ name: extFinal.toUpperCase(), extensions: [extFinal] }]
    });

    if (canceled || !filePath) return { success: false, reason: 'canceled' };

    await fs.promises.writeFile(filePath, buffer, { mode: 0o600 });
    return { success: true, path: filePath };
  } catch (err) {
    console.error("[Electron IPC Save Error]:", err);
    return { success: false, error: "No se pudo guardar el archivo de forma segura." };
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  limpiarSeleccionBlePendiente(true);
  if (process.platform !== 'darwin') app.quit();
});
