# Taurus Track Pro - Guia de Seguridad y Despliegue de Produccion

Este paquete contiene el codigo fuente completo, auditado y blindado de Taurus Track Pro.

## 1. Despliegue de Reglas de Firebase Firestore
El archivo firestore.rules contiene las reglas de seguridad basadas en roles (RBAC) y atributos (ABAC) con aislamiento multi-inquilino estricto.

Para desplegarlo usando Firebase CLI:
firebase deploy --only firestore:rules

Garantias de Seguridad:
1. Aislamiento Multi-Tenant: Ninguna estancia puede leer ni modificar los rodeos, pesos o eventos de otra estancia.
2. Prohibicion de Contrasenas en Texto Claro: Se bloquea a nivel de regla la escritura de cualquier atributo password en /usuarios/.
3. Control Granular por Modulo: Los operarios solo pueden registrar o consultar las secciones explicitamente concedidas por el propietario.
4. Proteccion del Panel de Administracion: El acceso a /sistema/ y funciones globales requiere rol SuperAdmin.

## 2. Configuracion de Google Apps Script (code.gs)
1. Abra su proyecto en script.google.com.
2. Reemplace el archivo con el nuevo code.gs.
3. Vaya a Configuracion del proyecto > Propiedades de la secuencia de comandos (Script Properties) y agregue:
   - OPENROUTER_KEY: Su API Key privada de OpenRouter (ej. sk-or-v1-...).
   - TAURUS_SHARED_SECRET: TAURUS_SECURE_TOKEN_2026 (secreto precompartido con la app para evitar peticiones no autorizadas y abuso de cuotas).
   - ONESIGNAL_KEY: Su clave REST API de OneSignal.
   - ONESIGNAL_APP_ID: 5d1a4839-8a6f-477b-bf67-38c1c031ba60.
4. Haga clic en Implementar > Nueva implementacion > Aplicacion web:
   - Ejecutar como: Yo.
   - Quien tiene acceso: Cualquier usuario.

## 3. Empaquetado y Ejecucion en Escritorio (Electron)
Se han creado main.js, preload.js y package.json aplicando los estandares mas estrictos de seguridad en Electron:
- nodeIntegration: false y contextIsolation: true.
- sandbox: true.
- Interceptacion y bloqueo de navegaciones externas y apertura de ventanas no autorizadas.
- Manejo seguro de guardado de archivos via IPC (guardar-reporte-local) protegido contra ataques de Path Traversal.

Para iniciar en desarrollo:
npm install
npm start

## 4. Hardware Sincronizado (Balanza BLE y Lector RFID UHF)
- Balanza: Se elimino el alert() modal que congelaba el hilo de ejecucion principal de JavaScript. Se implemento una notificacion visual/acustica no bloqueante y auto-asociacion temporal de 5 segundos con el chip RFID.
- Buffer BLE: Bufer acotado a 1 KB con purga automatica y descarte de residuos al desconectar (gattserverdisconnected).
- Lector HID: Discriminacion de cadencia inter-caracter para distinguir escaneres automaticos de tipeo manual.

## 5. Sincronizacion Offline Idempotente
- La cola de pendientes (tc_pendientes) procesa lotes en bloques de maximo 400 documentos (evitando el limite de 500 de Firestore).
- La eliminacion de registros locales es atomica y solo borra los identificadores confirmados por el commit de Firestore, garantizando cero perdida de datos ante desconexiones intermitentes.
