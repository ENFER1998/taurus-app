const { contextBridge, ipcRenderer } = require('electron');

const EXTENSIONES_PERMITIDAS = new Set(['pdf', 'xlsx', 'csv']);

contextBridge.exposeInMainWorld('taurusNative', Object.freeze({
  guardarArchivoLocal: (base64Data, nombreSugerido, extension) => {
    if (typeof base64Data !== 'string' || base64Data.length === 0 || base64Data.length > 35 * 1024 * 1024) {
      return Promise.resolve({ success: false, error: 'Datos de archivo inválidos' });
    }
    const nombreSeguro = String(nombreSugerido || 'Reporte_Taurus').replace(/[^a-zA-Z0-9_\-\.]/g, '_').slice(0, 120);
    const ext = String(extension || 'pdf').toLowerCase().trim();
    const extSegura = EXTENSIONES_PERMITIDAS.has(ext) ? ext : 'pdf';
    return ipcRenderer.invoke('guardar-reporte-local', {
      base64Data,
      nombreSugerido: nombreSeguro,
      extension: extSegura
    });
  },
  cancelarBusquedaBle: () => {
    return ipcRenderer.invoke('cancelar-busqueda-ble');
  },
  esDesktop: true,
  plataforma: process.platform
}));
