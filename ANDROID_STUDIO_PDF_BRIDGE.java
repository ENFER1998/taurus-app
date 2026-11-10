/*
 * ============================================================================
 * PUENTE NATIVO DE DESCARGA PDF PARA ANDROID STUDIO (WebView) — TAURUS TRACK PRO
 * ============================================================================
 * ¿Por qué el WebView de Android Studio bloquea las descargas de jsPDF por defecto?
 * - En iOS (Safari) y en PC, el navegador soporta URLs en memoria (`blob:https://...`).
 * - En cambio, el componente `android.webkit.WebView` de Android Studio NO soporta
 *   descargas `blob:` ni tiene `DownloadListener` activo para PDFs generados en JS,
 *   y `DownloadManager` de Android rechaza cualquier URL que no sea `http://` o `https://`.
 *
 * La web app (`index.html`) ya está programada para detectar automáticamente:
 *   1) `window.AndroidPdf.descargarPDF(base64Pdf, nombreArchivo)`
 *   2) `window.AndroidBluetooth.descargarPDF(base64Pdf, nombreArchivo)`
 *   3) Enlaces `data:application/pdf;base64,...` en `webView.setDownloadListener(...)`
 *
 * INSTRUCCIONES PARA TU PROYECTO EN ANDROID STUDIO (MainActivity.java):
 * Agrega este bloque en tu `MainActivity.java` donde configuras tu `webView`:
 * ============================================================================
 */

package com.taurus.trackpro; // <-- Ajusta a tu paquete actual en Android Studio

import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class TaurusPdfBridge {

    private final Context context;

    public TaurusPdfBridge(Context context) {
        this.context = context;
    }

    /**
     * Llamado automáticamente por index.html al tocar "Exportar Informe PDF"
     * o "Exportar Dossier Clínico (PDF)".
     */
    @JavascriptInterface
    public void descargarPDF(String base64Data, String nombreArchivo) {
        guardarBase64ComoPdfEnDescargas(context, base64Data, nombreArchivo);
    }

    @JavascriptInterface
    public void guardarPDF(String base64Data, String nombreArchivo) {
        guardarBase64ComoPdfEnDescargas(context, base64Data, nombreArchivo);
    }

    public static void configurarWebViewParaPDF(final Context context, WebView webView) {
        // 1. Registrar la interfaz JavaScript "AndroidPdf"
        webView.addJavascriptInterface(new TaurusPdfBridge(context), "AndroidPdf");

        // 2. Interceptar descargas data:application/pdf;base64,... directamente en el WebView
        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimetype, long contentLength) {
                if (url != null && url.startsWith("data:")) {
                    String fileName = "Reporte_Taurus_" + System.currentTimeMillis() + ".pdf";
                    guardarBase64ComoPdfEnDescargas(context, url, fileName);
                } else if (url != null && (url.startsWith("http://") || url.startsWith("https://"))) {
                    try {
                        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        context.startActivity(i);
                    } catch (Exception ignored) {}
                }
            }
        });
    }

    public static void guardarBase64ComoPdfEnDescargas(Context context, String base64Input, String fileName) {
        try {
            if (base64Input == null || base64Input.isEmpty()) return;
            String cleanBase64 = base64Input.contains(",")
                    ? base64Input.substring(base64Input.indexOf(",") + 1)
                    : base64Input;
            byte[] pdfBytes = Base64.decode(cleanBase64, Base64.DEFAULT);

            if (fileName == null || fileName.trim().isEmpty()) {
                fileName = "Reporte_Taurus.pdf";
            }
            if (!fileName.toLowerCase().endsWith(".pdf")) {
                fileName += ".pdf";
            }

            Uri uriGuardado = null;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                // Android 10+ (API 29+): Guarda directo en Descargas sin pedir permisos extra
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
                values.put(MediaStore.Downloads.MIME_TYPE, "application/pdf");
                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);

                uriGuardado = context.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uriGuardado != null) {
                    try (OutputStream os = context.getContentResolver().openOutputStream(uriGuardado)) {
                        if (os != null) {
                            os.write(pdfBytes);
                            os.flush();
                        }
                    }
                }
            } else {
                File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                if (!dir.exists()) dir.mkdirs();
                File outFile = new File(dir, fileName);
                try (FileOutputStream fos = new FileOutputStream(outFile)) {
                    fos.write(pdfBytes);
                    fos.flush();
                }
            }

            Toast.makeText(context, "PDF guardado en Descargas: " + fileName, Toast.LENGTH_LONG).show();

            // Abrir el PDF inmediatamente con el visor nativo del teléfono
            if (uriGuardado != null) {
                try {
                    Intent openIntent = new Intent(Intent.ACTION_VIEW);
                    openIntent.setDataAndType(uriGuardado, "application/pdf");
                    openIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                    context.startActivity(openIntent);
                } catch (Exception ignored) {}
            }
        } catch (Exception e) {
            Toast.makeText(context, "Error al guardar PDF: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }
}
