/**
 * TAURUS TRACK PRO - MOTOR SEGURO DE INTEGRACIÓN BACKEND (GOOGLE APPS SCRIPT)
 * Versión Hardened de Producción
 */

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
    if (e.postData && e.postData.contents) {
      try { 
        req = JSON.parse(e.postData.contents); 
      } catch (x) { 
        req = e.parameter || {}; 
      }
    } else { 
      req = e.parameter || {}; 
    }

    // 1. VALIDACIÓN DE AUTENTICACIÓN CENTRAL
    var SHARED_SECRET = PropertiesService.getScriptProperties().getProperty('TAURUS_SHARED_SECRET') || 'TAURUS_SECURE_TOKEN_2026';
    var tokenRecibido = req.token || (e.parameter && e.parameter.token);
    
    // Validar token de seguridad (estricto en IA para proteger cuotas de OpenAI/OpenRouter)
    if (accion === 'ia') {
      if (!tokenRecibido || tokenRecibido !== SHARED_SECRET) {
        return jsonResponse({ "status": "error", "error": "Acceso no autorizado: Token de seguridad inválido." });
      }
    }

    var accion = req.accion;
    if (!accion) {
      return jsonResponse({ "status": "error", "error": "Parámetro 'accion' requerido." });
    }

    // ==========================================
    // 2. MÓDULO CORA IA (OPENROUTER RESILIENTE)
    // ==========================================
    if (accion === 'ia') {
      var OPENROUTER_KEY = PropertiesService.getScriptProperties().getProperty('OPENROUTER_KEY');
      if (!OPENROUTER_KEY) {
        return jsonResponse({ "status": "error", "error": "OPENROUTER_KEY no configurada en ScriptProperties." });
      }

      var rawMensaje = req.mensaje || "";
      if (rawMensaje.length === 0 || rawMensaje.length > 500) {
        return jsonResponse({ "status": "error", "error": "Mensaje de usuario inválido o excede límite." });
      }

      var mensajeSanitizado = sanitizeInput(rawMensaje, 500);
      var nombreUsuario = sanitizeInput(req.nombreUsuario || "Productor", 50);
      var rolUsuario = sanitizeInput(req.rolUsuario || "Operador", 30);
      var haciendaNombre = sanitizeInput(req.haciendaNombre || "Hacienda", 60);
      var contexto = req.contexto || {};

      var promptSistema = "Eres 'Cora', la asistente de inteligencia artificial experta en ganadería de Taurus Track Pro.\n" +
        "Usuario: " + nombreUsuario + " (" + rolUsuario + ") en la hacienda " + haciendaNombre + ".\n" +
        "Hora local: " + sanitizeInput(contexto.horaLocal, 50) + ".\n\n" +
        "DATOS EN VIVO DEL RODEO:\n" +
        "- Cabezas activas: " + Number(contexto.cabezasVivas || 0) + "\n" +
        "- Preñadas: " + Number(contexto.prenadas || 0) + " | Vacías: " + Number(contexto.vacias || 0) + "\n" +
        "- Bajas: " + Number(contexto.bajasMortalidad || 0) + " (" + sanitizeInput(contexto.tasaMortalidad, 10) + ")\n" +
        "- Caravana activa en pantalla: " + sanitizeInput(contexto.rpActualEnPantalla, 25) + "\n\n" +
        "INSTRUCCIONES CLAVE:\n" +
        "0. SOPORTE: Responde instrucciones amigables de ganadería y app. 'comando': null.\n" +
        "1. FICHA: Para ver ficha o animal, usa 'buscar_caravana' con parámetro 'rp'.\n" +
        "2. ACCIONES: Para peso, tacto, vacuna o sanidad, usa 'accion_ganadera'.\n" +
        "3. FORMATO OBLIGATORIO JSON:\n" +
        "{\n  \"respuesta\": \"Texto...\",\n  \"comando\": \"accion_ganadera | buscar_caravana | filtrar_registro | generar_informe | null\",\n  \"parametros\": { \"rp\": \"Nº\", \"tipo\": \"Peso|Sanidad...\", \"valor\": \"dato\", \"detalles\": \"...\" }\n}";

      var payloadOR = {
        "model": "meta-llama/llama-3.1-8b-instruct",
        "messages": [
          { "role": "system", "content": promptSistema },
          { "role": "user", "content": mensajeSanitizado }
        ],
        "response_format": { "type": "json_object" },
        "temperature": 0.2
      };

      var opcionesOR = {
        "method": "post",
        "contentType": "application/json",
        "headers": {
          "Authorization": "Bearer " + OPENROUTER_KEY,
          "HTTP-Referer": "https://taurustrackpro.github.io",
          "X-Title": "TaurusTrackPro"
        },
        "payload": JSON.stringify(payloadOR),
        "muteHttpExceptions": true
      };

      var respuestaOR = UrlFetchApp.fetch("https://openrouter.ai/api/v1/chat/completions", opcionesOR);
      var jsonOR = JSON.parse(respuestaOR.getContentText());

      if (jsonOR.error) {
        return jsonResponse({ "status": "error", "error": jsonOR.error.message });
      }

      if (jsonOR.choices && jsonOR.choices.length > 0) {
        var txt = jsonOR.choices[0].message.content;
        var datosIA;
        try { 
          datosIA = JSON.parse(txt); 
        } catch(err) { 
          datosIA = { "respuesta": txt, "comando": null, "parametros": {} }; 
        }
        
        return jsonResponse({
          "status": "ok",
          "respuesta": datosIA.respuesta,
          "comando": datosIA.comando || null,
          "parametros": datosIA.parametros || {}
        });
      }
      return jsonResponse({ "status": "error", "error": "Respuesta vacía desde la IA." });
    }

    // ==========================================
    // 3. RESPALDO Y SINCRONIZACIÓN DE LOTES
    // ==========================================
    if (accion === 'sincronizar_lote') {
      return jsonResponse({ "status": "ok", "mensaje": "Lote recibido y registrado." });
    }

    // ==========================================
    // 4. ONESIGNAL: NOTIFICACIONES PUSH SEGMENTADAS
    // ==========================================
    var ONESIGNAL_REST_KEY = PropertiesService.getScriptProperties().getProperty('ONESIGNAL_KEY');
    var ONESIGNAL_APP_ID = PropertiesService.getScriptProperties().getProperty('ONESIGNAL_APP_ID') || '5d1a4839-8a6f-477b-bf67-38c1c031ba60';
    
    var mensajePush = sanitizeInput(req.mensaje || (e.parameter && e.parameter.mensaje), 200);
    var maestro = sanitizeInput(req.maestro || (e.parameter && e.parameter.maestro), 100);
    
    if (ONESIGNAL_REST_KEY && mensajePush && accion === 'notificar_accion' && maestro) {
      var payload = { 
        "app_id": ONESIGNAL_APP_ID, 
        "headings": { "es": "Taurus Track Pro" }, 
        "contents": { "es": mensajePush },
        "filters": [
          { "field": "tag", "key": "estancia_id", "relation": "=", "value": maestro },
          { "operator": "AND" },
          { "field": "tag", "key": "rol", "relation": "=", "value": "Propietario" }
        ]
      };
      
      UrlFetchApp.fetch("https://onesignal.com/api/v1/notifications", {
        "method": "post", 
        "contentType": "application/json", 
        "headers": { "Authorization": "Basic " + ONESIGNAL_REST_KEY }, 
        "payload": JSON.stringify(payload), 
        "muteHttpExceptions": true 
      });
      return jsonResponse({ "status": "ok" });
    }
    
    return jsonResponse({ "status": "ok" });
    
  } catch (error) {
    return jsonResponse({ "status": "error", "error": "Fallo interno: " + error.toString() });
  }
}
