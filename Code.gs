function doPost(e) {
  var data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch(error) {
    return ContentService.createTextOutput(JSON.stringify({ error: "No se pudo parsear el JSON." }))
                         .setMimeType(ContentService.MimeType.JSON);
  }

  var promptUsuario = data.mensaje;
  var contextoApp = data.contexto || {};

  if (!promptUsuario) {
    return ContentService.createTextOutput(JSON.stringify({ error: "Mensaje vacío." }))
                         .setMimeType(ContentService.MimeType.JSON);
  }

  var API_KEY = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY') || "";

  var systemPrompt = `
  Eres Cora, la inteligencia artificial de Taurus Control (sistema de gestión de ganado).
  El usuario te ha dado una instrucción por voz o texto. Debes determinar su "intención" y devolver un JSON estricto.

  Tus comandos permitidos ("comando"):
  - "buscar_caravana": Si el usuario dice "Buscame a la 4020", "Abrí la ficha de la vaca Lola". Requiere "params": {"rp": "4020"}
  - "accion_ganadera": Para registrar un evento en un animal (Pesaje, Tacto, Celo, Servicio, Nacimiento, Baja, etc.). Requiere "params": {"tipo": "Pesaje", "valor": "300", "detalles": "..."}
  - "filtrar_estado": Si dice "Mostrame los muertos", "Quiero ver las vacas vendidas". Requiere "params": {"estado": "muertos"} o {"estado": "vendidos"}.
  - "descargar_pdf": Si dice "Generame un reporte", "Descargá el PDF de preñeces".
  - "activar_rafaga": Si dice "Activá el modo ráfaga".
  - "crear_operador": Si dice "Creá un usuario nuevo".
  - "navegar": Para ir a otra vista genérica ("dashboard", "manga", "base", "informe", "config"). Requiere "params": {"vista": "manga"}.
  - "hablar": Si es solo una pregunta o saludo ("Hola Cora"). Devuelve en "params": {"respuesta": "¡Hola! ¿En qué te ayudo?"}.

  Formato de respuesta obligatorio (solo JSON, sin backticks):
  {
    "comando": "nombre_del_comando",
    "params": { ... }
  }
  `;

  var geminiPayload = {
    "contents": [
      {
        "role": "user",
        "parts": [
          { "text": systemPrompt + "\n\nInstrucción del usuario: " + promptUsuario + "\nContexto: " + JSON.stringify(contextoApp) }
        ]
      }
    ],
    "generationConfig": {
      "temperature": 0.2
    }
  };

  var options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(geminiPayload),
    "muteHttpExceptions": true
  };

  var response = UrlFetchApp.fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + API_KEY, options);

  var resultText = "";
  try {
    var responseData = JSON.parse(response.getContentText());
    if (responseData.candidates && responseData.candidates.length > 0) {
        resultText = responseData.candidates[0].content.parts[0].text;
    }
  } catch(e) {
    resultText = '{"comando":"hablar","params":{"respuesta":"Hubo un error de conexión con mi cerebro."}}';
  }

  resultText = resultText.replace(/```json/g, "").replace(/```/g, "").trim();

  return ContentService.createTextOutput(resultText)
                       .setMimeType(ContentService.MimeType.JSON);
}
