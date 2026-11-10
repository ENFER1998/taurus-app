function getSecureProperty(key) {
  var value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) {
    throw new Error("Propiedad requerida faltante en ScriptProperties");
  }
  return value;
}

function sanitizeInput(str, maxLen) {
  if (!str) return "";
  var clean = String(str).replace(/[<>"'`\\\r\n\0]/g, "").trim();
  return clean.substring(0, maxLen || 250);
}

function isValidEmailFormat(email) {
  if (!email) return false;
  var clean = String(email).trim().toLowerCase();
  return /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/.test(clean) && clean.length <= 120;
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function isAuthorizedAdminRequest(req, e) {
  var adminEmail = sanitizeInput(req.admin_email || (e && e.parameter && e.parameter.admin_email), 120).toLowerCase();
  var configuredAdmin = (PropertiesService.getScriptProperties().getProperty('ADMIN_EMAIL') || 'enfer.ro.98@gmail.com').toLowerCase();
  var configuredSecret = PropertiesService.getScriptProperties().getProperty('TAURUS_WEBHOOK_SECRET');
  var providedSecret = sanitizeInput(req.webhook_secret || (e && e.parameter && e.parameter.webhook_secret), 120);

  if (configuredSecret && providedSecret !== configuredSecret) {
    return false;
  }
  return adminEmail === configuredAdmin;
}

function doPost(e) {
  try {
    var req = {};
    if (e && e.postData && e.postData.contents) {
      if (e.postData.contents.length > 65536) {
        return jsonResponse({ "status": "error", "error": "Payload excede el límite permitido." });
      }
      try {
        req = JSON.parse(e.postData.contents);
      } catch (x) {
        req = (e && e.parameter) ? e.parameter : {};
      }
    } else {
      req = (e && e.parameter) ? e.parameter : {};
    }

    var accion = sanitizeInput(req.accion || (e && e.parameter && e.parameter.accion), 40);
    var accionesPermitidas = {
      'sincronizar_lote': true,
      'notificar_accion': true,
      'aviso_mantenimiento': true,
      'toggle_mantenimiento': true,
      'borrar_estancia_completa': true
    };

    if (!accion || !accionesPermitidas[accion]) {
      return jsonResponse({ "status": "error", "error": "Acción no válida o no autorizada." });
    }

    if (accion === 'sincronizar_lote') {
      return jsonResponse({ "status": "ok", "mensaje": "Lote recibido y registrado." });
    }

    if (accion === 'aviso_mantenimiento' || accion === 'toggle_mantenimiento' || accion === 'borrar_estancia_completa') {
      if (!isAuthorizedAdminRequest(req, e)) {
        return jsonResponse({ "status": "error", "error": "No autorizado para ejecutar acciones administrativas." });
      }
      if (accion === 'borrar_estancia_completa') {
        return jsonResponse({ "status": "ok", "mensaje": "Solicitud administrativa verificada." });
      }
    }

    var ONESIGNAL_REST_KEY = PropertiesService.getScriptProperties().getProperty('ONESIGNAL_KEY');
    var ONESIGNAL_APP_ID = PropertiesService.getScriptProperties().getProperty('ONESIGNAL_APP_ID') || '5d1a4839-8a6f-477b-bf67-38c1c031ba60';

    var mensajePush = sanitizeInput(req.mensaje || (e && e.parameter && e.parameter.mensaje), 240);
    var maestro = sanitizeInput(req.maestro || (e && e.parameter && e.parameter.maestro), 120).toLowerCase();
    var remitenteEmail = sanitizeInput(req.remitente_email || (e && e.parameter && e.parameter.remitente_email), 120).toLowerCase();
    var remitenteRol = sanitizeInput(req.remitente_rol || (e && e.parameter && e.parameter.remitente_rol), 40);

    if (ONESIGNAL_REST_KEY && mensajePush) {
      var payload = null;

      if (accion === 'notificar_accion' && isValidEmailFormat(maestro) && isValidEmailFormat(remitenteEmail)) {
        if (remitenteRol === 'DuenoPrimario' || remitenteEmail === maestro) {
          return jsonResponse({ "status": "ok", "skipped": "primary_owner_action" });
        }

        var filters = [
          { "field": "tag", "key": "estancia_id", "relation": "=", "value": maestro },
          { "operator": "AND" },
          { "field": "tag", "key": "sesion_activa", "relation": "=", "value": "true" }
        ];

        if (remitenteRol === 'DuenoSecundario') {
          filters.push({ "operator": "AND" });
          filters.push({ "field": "tag", "key": "rol", "relation": "=", "value": "Propietario" });
        } else {
          filters.push({ "operator": "AND" });
          filters.push({ "field": "tag", "key": "es_dueno", "relation": "=", "value": "true" });
        }

        filters.push({ "operator": "AND" });
        filters.push({ "field": "tag", "key": "usuario_email", "relation": "!=", "value": remitenteEmail });

        payload = {
          "app_id": ONESIGNAL_APP_ID,
          "headings": { "en": "Taurus Track Pro", "es": "Taurus Track Pro" },
          "contents": { "en": mensajePush, "es": mensajePush },
          "filters": filters
        };
      } else if (accion === 'aviso_mantenimiento' || accion === 'toggle_mantenimiento') {
        payload = {
          "app_id": ONESIGNAL_APP_ID,
          "headings": { "en": "Taurus Track Pro - Aviso Oficial", "es": "Taurus Track Pro - Aviso Oficial" },
          "contents": { "en": mensajePush, "es": mensajePush },
          "filters": [
            { "field": "tag", "key": "sesion_activa", "relation": "=", "value": "true" }
          ]
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
    return jsonResponse({ "status": "error", "error": "Solicitud rechazada por política de seguridad." });
  }
}
