function getSecureProperty(key) {
  var value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) {
    throw new Error("Propiedad requerida faltante en ScriptProperties: " + key);
  }
  return value;
}

function sanitizeInput(str, maxLen) {
  if (!str) return "";
  var clean = String(str).replace(/[<>"'`\\]/g, "").trim();
  return clean.substring(0, maxLen || 250);
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var req = {};
    if (e && e.postData && e.postData.contents) {
      try {
        req = JSON.parse(e.postData.contents);
      } catch (x) {
        req = (e && e.parameter) ? e.parameter : {};
      }
    } else {
      req = (e && e.parameter) ? e.parameter : {};
    }

    var accion = req.accion || (e && e.parameter && e.parameter.accion);
    if (!accion) {
      return jsonResponse({ "status": "error", "error": "Parámetro 'accion' requerido." });
    }

    if (accion === 'sincronizar_lote') {
      return jsonResponse({ "status": "ok", "mensaje": "Lote recibido y registrado." });
    }

    var ONESIGNAL_REST_KEY = PropertiesService.getScriptProperties().getProperty('ONESIGNAL_KEY');
    var ONESIGNAL_APP_ID = PropertiesService.getScriptProperties().getProperty('ONESIGNAL_APP_ID') || '5d1a4839-8a6f-477b-bf67-38c1c031ba60';

    var mensajePush = sanitizeInput(req.mensaje || (e && e.parameter && e.parameter.mensaje), 240);
    var maestro = sanitizeInput(req.maestro || (e && e.parameter && e.parameter.maestro), 120);

    if (ONESIGNAL_REST_KEY && mensajePush) {
      var payload = null;

      if (accion === 'notificar_accion' && maestro) {
        payload = {
          "app_id": ONESIGNAL_APP_ID,
          "headings": { "en": "Taurus Track Pro", "es": "Taurus Track Pro" },
          "contents": { "en": mensajePush, "es": mensajePush },
          "filters": [
            { "field": "tag", "key": "estancia_id", "relation": "=", "value": maestro },
            { "operator": "AND" },
            { "field": "tag", "key": "rol", "relation": "=", "value": "Propietario" }
          ]
        };
      } else if (accion === 'aviso_mantenimiento' || accion === 'toggle_mantenimiento') {
        payload = {
          "app_id": ONESIGNAL_APP_ID,
          "headings": { "en": "Taurus Track Pro - Aviso Oficial", "es": "Taurus Track Pro - Aviso Oficial" },
          "contents": { "en": mensajePush, "es": mensajePush },
          "included_segments": ["Total Subscriptions", "Subscribed Users"]
        };
      }

      if (payload) {
        var resOS = UrlFetchApp.fetch("https://onesignal.com/api/v1/notifications", {
          "method": "post",
          "contentType": "application/json",
          "headers": { "Authorization": "Basic " + ONESIGNAL_REST_KEY },
          "payload": JSON.stringify(payload),
          "muteHttpExceptions": true
        });
        return jsonResponse({ "status": "ok", "onesignal_code": resOS.getResponseCode() });
      }
    }

    return jsonResponse({ "status": "ok" });
  } catch (error) {
    return jsonResponse({ "status": "error", "error": "Fallo interno: " + error.toString() });
  }
}
