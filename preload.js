const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('taurusNative', {
  guardarArchivoLocal: (base64Data, nombreSugerido, extension) => {
    return ipcRenderer.invoke('guardar-reporte-local', { base64Data, nombreSugerido, extension });
  },
  cancelarBusquedaBle: () => {
    return ipcRenderer.invoke('cancelar-busqueda-ble');
  },
  esDesktop: true,
  plataforma: process.platform
});
