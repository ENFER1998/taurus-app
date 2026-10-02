function doPost(e) {
  try {
    var req = {};
    if (e.postData && e.postData.contents) {
      try { req = JSON.parse(e.postData.contents); } catch (x) { req = e.parameter; }
    } else { req = e.parameter; }
    
    var accion = req.accion || e.parameter.accion;
    
    // ==========================================
    // 1. CORA: INTELIGENCIA ARTIFICIAL (OPENROUTER)
    // ==========================================
    if (accion === 'ia') {
      var maestro = req.maestro || e.parameter.maestro;
      var mensaje = req.mensaje || e.parameter.mensaje;
      var nombreUsuario = req.nombreUsuario || "Productor";
      var rolUsuario = req.rolUsuario || "Operador";
      var haciendaNombre = req.haciendaNombre || "Hacienda";
      var contexto = req.contexto || {};
      
      var OPENROUTER_KEY = PropertiesService.getScriptProperties().getProperty('OPENROUTER_KEY') || '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';
      var urlOR = "https://openrouter.ai/api/v1/chat/completions";
      
      var promptSistema = "Eres 'Cora', la asistente de inteligencia artificial experta en ganadería de Taurus Control.\n" +
      "Estás hablando con " + nombreUsuario + " (" + rolUsuario + ") en la hacienda " + haciendaNombre + ".\n" +
      "Hora local: " + contexto.horaLocal + ".\n\n" +
      "HISTORIAL RECIENTE:\n" + (contexto.historial || "Sin mensajes recientes.") + "\n\n" +
      "DATOS EN VIVO:\n" +
      "- Cabezas vivas: " + contexto.cabezasVivas + "\n" +
      "- Preñadas: " + (contexto.prenadas || 0) + " | Vacías: " + (contexto.vacias || 0) + "\n" +
      "- Bajas: " + contexto.bajasMortalidad + " (" + contexto.tasaMortalidad + ")\n" +
      "- Caravana activa en pantalla: " + (contexto.rpActualEnPantalla || "Ninguno") + "\n\n" +
      "INSTRUCCIONES CLAVE:\n" +
      "0. SOPORTE: Si pide ayuda sobre cómo usar la app, da instrucciones paso a paso amigables y pon 'comando': null.\n" +
      "1. FICHA: Si pide 'Buscar caravana X' o 'Mostrame ficha', usa 'buscar_caravana' (extrae 'rp'). ¡Si el RP actual en pantalla ya es el que pidió, NO mandes buscar_caravana de nuevo, solo respóndele!\n" +
      "2. FILTROS: Si pide ver 'vacas muertas', 'bueyes', usa 'filtrar_registro' y define 'estado', 'categoria', 'dx', 'lote'.\n" +
      "3. REPORTES: Para descargar PDF, usa 'generar_informe'. Define 'modo', 'categoria', etc.\n" +
      "4. CARGAR TRABAJO (Tacto, peso, vacuna): Usa 'accion_ganadera'. Extrae 'rp', 'tipo' y obligatorio un 'valor'.\n" +
      "5. BAJA/MUERTE: 'accion_ganadera' tipo 'Baja'. El 'valor' es LA CAUSA. Si no la dice, pregunta ('comando': null).\n" +
      "6. NACIMIENTO/GENÉTICA: Usa 'accion_ganadera'. Si da nacimiento, ponlo SOLO en el campo 'nacimiento' (YYYY-MM).\n" +
      "7. OTROS: 'borrar_caravana', 'renombrar_caravana' (nuevo_rp), 'clasificar_animal' (categoria, lote, carimbo).\n" +
      "8. GESTIÓN: 'crear_operador', 'eliminar_operador', 'cambiar_permiso_operador', 'cambiar_tema'.\n" +
      "9. OBLIGATORIO: Responde SOLO en JSON con esta estructura:\n" +
      "{\n" +
      "  \"respuesta\": \"Texto ameno para hablar al usuario...\",\n" +
      "  \"comando\": \"accion_ganadera | buscar_caravana | filtrar_registro | generar_informe | crear_operador | null\",\n" +
      "  \"parametros\": { \"rp\": \"Nº\", \"tipo\": \"Peso|Sanidad|Diagnóstico...\", \"valor\": \"dato\", \"detalles\": \"...\", \"nacimiento\": \"YYYY-MM\" }\n" +
      "}";

      var payloadOR = {
        "model": "meta-llama/llama-3.1-8b-instruct",
        "messages": [
          {"role": "system", "content": promptSistema},
          {"role": "user", "content": mensaje}
        ],
        "response_format": { "type": "json_object" }
      };
      
      var opcionesOR = {
        "method": "post", "contentType": "application/json",
        "headers": { "Authorization": "Bearer " + OPENROUTER_KEY, "HTTP-Referer": "https://tauruscontrol.github.io", "X-Title": "Taurus" },
        "payload": JSON.stringify(payloadOR), "muteHttpExceptions": true 
      };
      
      var respuestaOR = UrlFetchApp.fetch(urlOR, opcionesOR);
      var jsonOR = JSON.parse(respuestaOR.getContentText());
      
      if (jsonOR.error) return ContentService.createTextOutput(JSON.stringify({"status": "error", "error": jsonOR.error.message})).setMimeType(ContentService.MimeType.JSON);
      
      if (jsonOR.choices && jsonOR.choices.length > 0) {
        var txt = jsonOR.choices[0].message.content;
        var datosIA;
        try { datosIA = JSON.parse(txt); } catch(err) { datosIA = { "respuesta": txt, "comando": null, "parametros": {} }; }
        
        // RETORNAMOS AQUÍ Y CORTAMOS LA EJECUCIÓN (Previene enviar notificaciones push por error)
        return ContentService.createTextOutput(JSON.stringify({
          "status": "ok", "respuesta": datosIA.respuesta, "comando": datosIA.comando || null, "parametros": datosIA.parametros || {}
        })).setMimeType(ContentService.MimeType.JSON);
      } else {
        return ContentService.createTextOutput(JSON.stringify({"status": "error", "error": "Respuesta vacía"})).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // ==========================================
    // 2. ONESIGNAL: NOTIFICACIONES PUSH Y MANTENIMIENTO
    // ==========================================
    var ONESIGNAL_REST_KEY = PropertiesService.getScriptProperties().getProperty('ONESIGNAL_KEY');
    var ONESIGNAL_APP_ID = "5d1a4839-8a6f-477b-bf67-38c1c031ba60";
    
    // Solo enviamos notificaciones si hay un mensaje y una accion correspondiente
    var mensajePush = req.mensaje || e.parameter.mensaje;
    var maestro = req.maestro || e.parameter.maestro;
    
    if (mensajePush && (accion === 'aviso_mantenimiento' || accion === 'toggle_mantenimiento' || accion === 'notificar_accion')) {
      var payload = { "app_id": ONESIGNAL_APP_ID, "headings": {"en": "Taurus Control", "es": "Taurus Control"}, "contents": {"en": mensajePush, "es": mensajePush} };
      
      if (accion === 'aviso_mantenimiento' || accion === 'toggle_mantenimiento') {
        payload.included_segments = ["All"];
      } else if (accion === 'notificar_accion') {
        payload.filters = [
          {"field": "tag", "key": "estancia_id", "relation": "=", "value": maestro},
          {"operator": "AND"},
          {"field": "tag", "key": "rol", "relation": "=", "value": "Propietario"}
        ];
      }
      
      UrlFetchApp.fetch("https://onesignal.com/api/v1/notifications", { "method": "post", "contentType": "application/json", "headers": {"Authorization": "Basic " + ONESIGNAL_REST_KEY}, "payload": JSON.stringify(payload), "muteHttpExceptions": true });
    }
    
    return ContentService.createTextOutput(JSON.stringify({"status": "ok"})).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({"status": "error", "error": "Error interno del script: " + error.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
}
