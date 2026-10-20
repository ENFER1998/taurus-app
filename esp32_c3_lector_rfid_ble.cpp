#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <esp_mac.h>
#include <esp_arduino_version.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <BLEHIDDevice.h>
#include <HIDTypes.h>

constexpr int PIN_LED_STATUS = 8;
constexpr int PIN_BTN_TEST   = 9;
constexpr int PIN_RFID_RX    = 4;
constexpr int PIN_RFID_TX    = 5;

constexpr unsigned long TIEMPO_ESPERA_ACK_BALANZA_MS = 180;
constexpr unsigned long TIEMPO_MAX_ESPERA_PESO_MS    = 20000;
constexpr unsigned long VENTANA_HEARTBEAT_ACTIVO_MS  = 5000;
constexpr unsigned long COOLDOWN_MISMA_CARAVANA_MS   = 2000;
constexpr unsigned long DEBOUNCE_MS                  = 350;

constexpr uint8_t ESPNOW_WIFI_CHANNEL = 1;
uint8_t macBroadcast[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

enum TipoMensaje : uint8_t {
  MSG_RFID_DETECTADO     = 1,
  MSG_PESO_ESTABLE       = 2,
  MSG_ACK_BALANZA_ONLINE = 3,
  MSG_HEARTBEAT_BALANZA  = 4
};

struct __attribute__((packed)) PaqueteGanado {
  uint8_t tipoMensaje;
  char rfid[24];
  float pesoKg;
  uint32_t secuencia;
};

constexpr const char* BLE_DEVICE_NAME = "Taurus Track Pro";
constexpr const char* SERVICE_UUID    = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E";
constexpr const char* CHAR_UUID_RX    = "6E400002-B5A3-F393-E0A9-E50E24DCCA9E";
constexpr const char* CHAR_UUID_TX    = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E";

static const uint8_t TAURUS_HID_REPORT_MAP[] = {
  0x05, 0x01,
  0x09, 0x06,
  0xA1, 0x01,
  0x85, 0x01,
  0x05, 0x07,
  0x19, 0xE0,
  0x29, 0xE7,
  0x15, 0x00,
  0x25, 0x01,
  0x75, 0x01,
  0x95, 0x08,
  0x81, 0x02,
  0x95, 0x01,
  0x75, 0x08,
  0x81, 0x01,
  0x95, 0x05,
  0x75, 0x01,
  0x05, 0x08,
  0x19, 0x01,
  0x29, 0x05,
  0x91, 0x02,
  0x95, 0x01,
  0x75, 0x03,
  0x91, 0x01,
  0x95, 0x06,
  0x75, 0x08,
  0x15, 0x00,
  0x25, 0x65,
  0x05, 0x07,
  0x19, 0x00,
  0x29, 0x65,
  0x81, 0x00,
  0xC0
};

BLEServer* pServer = nullptr;
BLECharacteristic* pTxCharacteristic = nullptr;
BLEHIDDevice* pHidDevice = nullptr;
BLECharacteristic* pHidInputReport = nullptr;
BLECharacteristic* pHidOutputReport = nullptr;

volatile bool bleClienteConectado = false;
bool bleClienteConectadoPrevio = false;
volatile bool modoUartSolicitadoPorApp = false;

char caravanaPendiente[24] = "";
char ultimaCaravanaEnviada[24] = "";
unsigned long tiempoUltimaCaravanaEnviada = 0;

bool esperandoAckBalanza = false;
bool esperandoPesaje = false;
unsigned long tiempoLecturaRfid = 0;
uint32_t contadorSecuencia = 0;
uint32_t ultimaSecuenciaPesoProcesada = 0;

volatile bool nuevoPesoRecibido = false;
volatile bool ackBalanzaRecibido = false;
volatile unsigned long ultimoHeartbeatBalanza = 0;
volatile bool balanzaVistaAlgunaVez = false;
PaqueteGanado ultimoPaqueteRecibido;
PaqueteGanado paqueteRfidEnCurso;

unsigned long ultimoTiempoBoton = 0;
unsigned long ultimoDestelloBle = 0;

constexpr const char* CODIGOS_RFID_PRUEBA[4] = {
  "982000123456001",
  "982000123456002",
  "982000123456003",
  "982000123456004"
};
uint8_t indiceRfidPrueba = 0;

char bufferUsb[64];
size_t idxUsb = 0;
char bufferRfidUart[64];
size_t idxRfidUart = 0;
unsigned long ultimoByteRfidMs = 0;

void registrarNuevaCaravana(const char* rawRfid);

class ServidorBleCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* server) override {
    (void)server;
    bleClienteConectado = true;
  }

  void onDisconnect(BLEServer* server) override {
    (void)server;
    bleClienteConectado = false;
    modoUartSolicitadoPorApp = false;
  }
};

class RxUartCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* characteristic) override {
    String valor = characteristic->getValue().c_str();
    valor.trim();
    if (valor.length() == 0) return;

    if (valor.indexOf("MODE:UART") >= 0 || valor.indexOf("TAURUS") >= 0) {
      modoUartSolicitadoPorApp = true;
      Serial.println("[BLE] Modo GATT UART directo confirmado por la aplicación.");
    } else if (valor.startsWith("SIM:")) {
      String tag = valor.substring(4);
      tag.trim();
      if (tag.length() > 0) {
        registrarNuevaCaravana(tag.c_str());
      }
    }
  }
};

bool mapearCaracterAHid(char c, uint8_t& keycode, uint8_t& modifier) {
  modifier = 0x00;
  keycode = 0x00;

  if (c >= '1' && c <= '9') {
    keycode = 0x1E + (c - '1');
    return true;
  }
  if (c == '0') {
    keycode = 0x27;
    return true;
  }
  if (c >= 'a' && c <= 'z') {
    keycode = 0x04 + (c - 'a');
    return true;
  }
  if (c >= 'A' && c <= 'Z') {
    modifier = 0x02;
    keycode = 0x04 + (c - 'A');
    return true;
  }
  if (c == ',') {
    keycode = 0x36;
    return true;
  }
  if (c == '.') {
    keycode = 0x37;
    return true;
  }
  if (c == ' ') {
    keycode = 0x2C;
    return true;
  }
  if (c == '-') {
    keycode = 0x2D;
    return true;
  }
  if (c == '\n' || c == '\r') {
    keycode = 0x28;
    return true;
  }
  return false;
}

void enviarTeclaHid(uint8_t keycode, uint8_t modifier) {
  if (pHidInputReport == nullptr) return;

  uint8_t reportPress[8] = {modifier, 0x00, keycode, 0x00, 0x00, 0x00, 0x00, 0x00};
  pHidInputReport->setValue(reportPress, sizeof(reportPress));
  pHidInputReport->notify();
  delay(20);

  uint8_t reportRelease[8] = {0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00};
  pHidInputReport->setValue(reportRelease, sizeof(reportRelease));
  pHidInputReport->notify();
  delay(20);
}

void enviarTextoPorHid(const char* trama) {
  if (pHidInputReport == nullptr) return;
  bool enterEnviado = false;

  for (size_t i = 0; trama[i] != '\0'; i++) {
    char c = trama[i];
    if (c == '\r') continue;
    if (c == '\n') {
      enviarTeclaHid(0x28, 0x00);
      enterEnviado = true;
      continue;
    }
    uint8_t keycode = 0;
    uint8_t modifier = 0;
    if (mapearCaracterAHid(c, keycode, modifier)) {
      enviarTeclaHid(keycode, modifier);
    }
  }

  if (!enterEnviado) {
    enviarTeclaHid(0x28, 0x00);
  }
}

#if ESP_ARDUINO_VERSION >= ESP_ARDUINO_VERSION_VAL(3, 0, 0)
void alEnviarEspNow(const wifi_tx_info_t* info, esp_now_send_status_t status) {
  (void)info;
  (void)status;
}
#else
void alEnviarEspNow(const uint8_t* mac_addr, esp_now_send_status_t status) {
  (void)mac_addr;
  (void)status;
}
#endif

#if ESP_ARDUINO_VERSION >= ESP_ARDUINO_VERSION_VAL(3, 0, 0)
void alRecibirEspNow(const esp_now_recv_info_t* info, const uint8_t* datos, int longitud) {
  (void)info;
#else
void alRecibirEspNow(const uint8_t* mac, const uint8_t* datos, int longitud) {
  (void)mac;
#endif
  if (longitud != sizeof(PaqueteGanado)) {
    return;
  }

  PaqueteGanado paqueteEntrante;
  memcpy(&paqueteEntrante, datos, sizeof(PaqueteGanado));
  ultimoHeartbeatBalanza = millis();
  balanzaVistaAlgunaVez = true;

  if (paqueteEntrante.tipoMensaje == MSG_ACK_BALANZA_ONLINE) {
    ackBalanzaRecibido = true;
  } else if (paqueteEntrante.tipoMensaje == MSG_PESO_ESTABLE) {
    if (paqueteEntrante.secuencia != ultimaSecuenciaPesoProcesada || paqueteEntrante.secuencia == 0) {
      ultimaSecuenciaPesoProcesada = paqueteEntrante.secuencia;
      memcpy((void*)&ultimoPaqueteRecibido, &paqueteEntrante, sizeof(PaqueteGanado));
      nuevoPesoRecibido = true;
    }
  }
}

void parpadearLed(int repeticiones, int duracionMs) {
  for (int i = 0; i < repeticiones; i++) {
    digitalWrite(PIN_LED_STATUS, LOW);
    delay(duracionMs);
    digitalWrite(PIN_LED_STATUS, HIGH);
    delay(duracionMs);
  }
}

void transmitirTramaBle(const char* trama) {
  Serial.println("=========================================");
  Serial.print("[TAURUS TRACK PRO] Trama enviada: ");
  Serial.print(trama);

  if (!bleClienteConectado) {
    Serial.println("[BLE] Aviso: Aún no hay teléfono ni PC conectado a 'Taurus Track Pro'.");
    Serial.println("=========================================");
    return;
  }

  delay(40);

  if (pTxCharacteristic != nullptr) {
    size_t len = strlen(trama);
    size_t offset = 0;
    while (offset < len) {
      size_t chunkLen = (len - offset > 18) ? 18 : (len - offset);
      pTxCharacteristic->setValue((uint8_t*)(trama + offset), chunkLen);
      pTxCharacteristic->notify();
      offset += chunkLen;
      if (offset < len) {
        delay(25);
      }
    }
    Serial.println("[BLE UART] Notificación GATT enviada correctamente en 6E400003.");
  }

  if (!modoUartSolicitadoPorApp) {
    delay(25);
    enviarTextoPorHid(trama);
    Serial.println("[BLE HID] Trama tipeada por HID para Safari iOS / Sistema.");
  }

  Serial.println("=========================================");
}

void enviarRfidYPesoPorBluetooth(const char* codigoRfid, float pesoKg) {
  char tramaBle[64];
  snprintf(tramaBle, sizeof(tramaBle), "%s,%.2f\r\n", codigoRfid, pesoKg);
  transmitirTramaBle(tramaBle);

  strncpy(ultimaCaravanaEnviada, codigoRfid, sizeof(ultimaCaravanaEnviada) - 1);
  ultimaCaravanaEnviada[sizeof(ultimaCaravanaEnviada) - 1] = '\0';
  tiempoUltimaCaravanaEnviada = millis();
}

void enviarSoloRfidPorBluetooth(const char* codigoRfid) {
  char tramaBle[64];
  snprintf(tramaBle, sizeof(tramaBle), "%s\r\n", codigoRfid);
  transmitirTramaBle(tramaBle);

  strncpy(ultimaCaravanaEnviada, codigoRfid, sizeof(ultimaCaravanaEnviada) - 1);
  ultimaCaravanaEnviada[sizeof(ultimaCaravanaEnviada) - 1] = '\0';
  tiempoUltimaCaravanaEnviada = millis();
}

void enviarSoloPesoPorBluetooth(float pesoKg) {
  char tramaBle[64];
  snprintf(tramaBle, sizeof(tramaBle), "PESO %.2f\r\n", pesoKg);
  transmitirTramaBle(tramaBle);
}

void limpiarTramaRfid(const char* entrada, char* salida, size_t maxLen) {
  size_t j = 0;
  for (size_t i = 0; entrada[i] != '\0' && j < maxLen - 1; i++) {
    char c = entrada[i];
    if (isalnum((unsigned char)c) || c == '-' || c == '_') {
      salida[j++] = (char)toupper((unsigned char)c);
    }
  }
  salida[j] = '\0';
}

void registrarNuevaCaravana(const char* rawRfid) {
  char nuevoRfid[24];
  limpiarTramaRfid(rawRfid, nuevoRfid, sizeof(nuevoRfid));

  if (strlen(nuevoRfid) < 2) {
    return;
  }

  unsigned long ahora = millis();

  if ((esperandoAckBalanza || esperandoPesaje) && strcmp(caravanaPendiente, nuevoRfid) == 0) {
    Serial.println("[RFID] Misma caravana aún en el brete esperando peso.");
    return;
  }

  if (strlen(ultimaCaravanaEnviada) > 0 &&
      strcmp(ultimaCaravanaEnviada, nuevoRfid) == 0 &&
      (ahora - tiempoUltimaCaravanaEnviada < COOLDOWN_MISMA_CARAVANA_MS)) {
    Serial.println("[RFID] Lectura duplicada reciente ignorada por filtro antirrebote.");
    return;
  }

  if ((esperandoAckBalanza || esperandoPesaje) && strlen(caravanaPendiente) > 0) {
    Serial.println("[AVISO] Nuevo animal entró al brete antes del peso. Enviando caravana anterior sola...");
    enviarSoloRfidPorBluetooth(caravanaPendiente);
  }

  strncpy(caravanaPendiente, nuevoRfid, sizeof(caravanaPendiente) - 1);
  caravanaPendiente[sizeof(caravanaPendiente) - 1] = '\0';

  contadorSecuencia++;
  ackBalanzaRecibido = false;
  esperandoAckBalanza = true;
  esperandoPesaje = false;
  tiempoLecturaRfid = ahora;

  Serial.println("-----------------------------------------");
  Serial.print("[RFID LEÍDO] Caravana: ");
  Serial.println(caravanaPendiente);
  Serial.println("[ESP-NOW] Consultando si la balanza está encendida...");

  memset(&paqueteRfidEnCurso, 0, sizeof(paqueteRfidEnCurso));
  paqueteRfidEnCurso.tipoMensaje = MSG_RFID_DETECTADO;
  strncpy(paqueteRfidEnCurso.rfid, caravanaPendiente, sizeof(paqueteRfidEnCurso.rfid) - 1);
  paqueteRfidEnCurso.pesoKg = 0.0f;
  paqueteRfidEnCurso.secuencia = contadorSecuencia;

  esp_now_send(macBroadcast, (uint8_t*)&paqueteRfidEnCurso, sizeof(paqueteRfidEnCurso));
}

void renovarMacParaEvitarCacheGatt() {
  uint8_t macBase[6] = {0};
  esp_efuse_mac_get_default(macBase);
  macBase[5] = (uint8_t)((macBase[5] + 8) & 0xFE);
  esp_base_mac_addr_set(macBase);
}

void inicializarBle() {
  renovarMacParaEvitarCacheGatt();

  BLEDevice::init(BLE_DEVICE_NAME);
  BLEDevice::setPower(ESP_PWR_LVL_P3);

  BLESecurity* pSecurity = new BLESecurity();
  pSecurity->setAuthenticationMode(ESP_LE_AUTH_BOND);
  pSecurity->setCapability(ESP_IO_CAP_NONE);
  pSecurity->setInitEncryptionKey(ESP_BLE_ENC_KEY_MASK | ESP_BLE_ID_KEY_MASK);
  pSecurity->setRespEncryptionKey(ESP_BLE_ENC_KEY_MASK | ESP_BLE_ID_KEY_MASK);

  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new ServidorBleCallbacks());

  BLEService* pUartService = pServer->createService(BLEUUID(SERVICE_UUID), 30, 0);

  pTxCharacteristic = pUartService->createCharacteristic(
    CHAR_UUID_TX,
    BLECharacteristic::PROPERTY_NOTIFY | BLECharacteristic::PROPERTY_READ
  );
  pTxCharacteristic->addDescriptor(new BLE2902());

  BLECharacteristic* pRxCharacteristic = pUartService->createCharacteristic(
    CHAR_UUID_RX,
    BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR
  );
  pRxCharacteristic->setCallbacks(new RxUartCallbacks());

  pUartService->start();

  pHidDevice = new BLEHIDDevice(pServer);
  pHidInputReport = pHidDevice->inputReport(1);
  pHidOutputReport = pHidDevice->outputReport(1);
  pHidDevice->manufacturer()->setValue("Taurus Track Pro");
  pHidDevice->pnp(0x02, 0xe502, 0xa111, 0x0210);
  pHidDevice->hidInfo(0x00, 0x02);
  pHidDevice->reportMap((uint8_t*)TAURUS_HID_REPORT_MAP, sizeof(TAURUS_HID_REPORT_MAP));
  pHidDevice->startServices();
  pHidDevice->setBatteryLevel(100);

  BLEAdvertising* pAdvertising = BLEDevice::getAdvertising();

  BLEAdvertisementData advData;
  advData.setFlags(0x06);
  advData.setAppearance(HID_KEYBOARD);
  advData.setCompleteServices(BLEUUID((uint16_t)0x1812));
  advData.setName(BLE_DEVICE_NAME);
  pAdvertising->setAdvertisementData(advData);

  BLEAdvertisementData scanResponseData;
  scanResponseData.setCompleteServices(BLEUUID(SERVICE_UUID));
  pAdvertising->setScanResponseData(scanResponseData);

  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);
  pAdvertising->setMaxPreferred(0x12);

  BLEDevice::startAdvertising();

  Serial.print("[BLE] Anunciando como: ");
  Serial.println(BLE_DEVICE_NAME);
}

void inicializarEspNow() {
  WiFi.mode(WIFI_STA);
  esp_wifi_set_ps(WIFI_PS_MIN_MODEM);
  WiFi.setTxPower(WIFI_POWER_8_5dBm);
  esp_wifi_set_channel(ESPNOW_WIFI_CHANNEL, WIFI_SECOND_CHAN_NONE);

  Serial.print("[WIFI] MAC del Lector RFID: ");
  Serial.println(WiFi.macAddress());

  if (esp_now_init() != ESP_OK) {
    Serial.println("[ERROR] No se pudo inicializar ESP-NOW.");
    return;
  }

  esp_now_register_send_cb(alEnviarEspNow);
  esp_now_register_recv_cb(alRecibirEspNow);

  esp_now_peer_info_t peerInfo = {};
  memcpy(peerInfo.peer_addr, macBroadcast, 6);
  peerInfo.channel = ESPNOW_WIFI_CHANNEL;
  peerInfo.encrypt = false;

  if (esp_now_add_peer(&peerInfo) != ESP_OK) {
    Serial.println("[ERROR] Falló el registro del peer de balanza.");
  } else {
    Serial.println("[ESP-NOW] Listo en canal 1 (coexistencia BLE activa).");
  }
}

void procesarEntradaUsbNoBloqueante() {
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (idxUsb > 0) {
        bufferUsb[idxUsb] = '\0';
        idxUsb = 0;
        registrarNuevaCaravana(bufferUsb);
      }
    } else if (idxUsb < sizeof(bufferUsb) - 1) {
      bufferUsb[idxUsb++] = c;
    }
  }
}

void procesarEntradaRfidUartNoBloqueante() {
  while (Serial1.available() > 0) {
    char c = (char)Serial1.read();
    ultimoByteRfidMs = millis();

    if (c == '\n' || c == '\r' || c == 0x03) {
      if (idxRfidUart >= 3) {
        bufferRfidUart[idxRfidUart] = '\0';
        idxRfidUart = 0;
        registrarNuevaCaravana(bufferRfidUart);
      } else {
        idxRfidUart = 0;
      }
    } else if (c == 0x02) {
      idxRfidUart = 0;
    } else if (c >= 32 && c <= 126 && idxRfidUart < sizeof(bufferRfidUart) - 1) {
      bufferRfidUart[idxRfidUart++] = c;
    }
  }

  if (idxRfidUart >= 4 && (millis() - ultimoByteRfidMs >= 60)) {
    bufferRfidUart[idxRfidUart] = '\0';
    idxRfidUart = 0;
    registrarNuevaCaravana(bufferRfidUart);
  }
}

void setup() {
  pinMode(PIN_LED_STATUS, OUTPUT);
  digitalWrite(PIN_LED_STATUS, HIGH);
  pinMode(PIN_BTN_TEST, INPUT_PULLUP);
  pinMode(PIN_RFID_RX, INPUT_PULLUP);

  Serial.begin(115200);
  Serial1.begin(9600, SERIAL_8N1, PIN_RFID_RX, PIN_RFID_TX);
  pinMode(PIN_RFID_RX, INPUT_PULLUP);

  delay(800);
  Serial.println("\n=== INICIANDO TAURUS TRACK PRO (NODO 1: RFID + BLE + ESP-NOW) ===");

  inicializarBle();
  inicializarEspNow();

  parpadearLed(4, 100);
}

void loop() {
  unsigned long ahora = millis();

  if (!bleClienteConectado && bleClienteConectadoPrevio) {
    delay(250);
    BLEDevice::startAdvertising();
    Serial.println("[BLE] Dispositivo desconectado. Volviendo a anunciar 'Taurus Track Pro'...");
    bleClienteConectadoPrevio = bleClienteConectado;
  }
  if (bleClienteConectado && !bleClienteConectadoPrevio) {
    Serial.println("[BLE] Dispositivo conectado a 'Taurus Track Pro'.");
    bleClienteConectadoPrevio = bleClienteConectado;
    parpadearLed(2, 120);
  }

  if (digitalRead(PIN_BTN_TEST) == LOW) {
    if (ahora - ultimoTiempoBoton > DEBOUNCE_MS) {
      ultimoTiempoBoton = ahora;
      const char* rfidSimulado = CODIGOS_RFID_PRUEBA[indiceRfidPrueba];
      indiceRfidPrueba = (indiceRfidPrueba + 1) % 4;
      ultimaCaravanaEnviada[0] = '\0';
      registrarNuevaCaravana(rfidSimulado);
    }
  }

  procesarEntradaUsbNoBloqueante();

  procesarEntradaRfidUartNoBloqueante();

  if (esperandoAckBalanza) {
    bool balanzaConHeartbeatReciente = balanzaVistaAlgunaVez && ((ahora - ultimoHeartbeatBalanza) <= VENTANA_HEARTBEAT_ACTIVO_MS);

    if (ackBalanzaRecibido) {
      ackBalanzaRecibido = false;
      esperandoAckBalanza = false;
      esperandoPesaje = true;
      Serial.println("[MODO COMBINADO] Balanza activa. Esperando el peso...");
      parpadearLed(2, 60);
    } else if (ahora - tiempoLecturaRfid >= TIEMPO_ESPERA_ACK_BALANZA_MS) {
      if (balanzaConHeartbeatReciente) {
        esperandoAckBalanza = false;
        esperandoPesaje = true;
        Serial.println("[MODO COMBINADO] Balanza activa por Heartbeat. Esperando el peso...");
        parpadearLed(2, 60);
      } else {
        esperandoAckBalanza = false;
        esperandoPesaje = false;
        Serial.println("[MODO INDEPENDIENTE] Balanza apagada. Enviando RFID por Bluetooth...");
        enviarSoloRfidPorBluetooth(caravanaPendiente);
        caravanaPendiente[0] = '\0';
        parpadearLed(1, 100);
      }
    }
  }

  if (nuevoPesoRecibido) {
    PaqueteGanado paqueteLocal;
    noInterrupts();
    memcpy(&paqueteLocal, (const void*)&ultimoPaqueteRecibido, sizeof(PaqueteGanado));
    nuevoPesoRecibido = false;
    interrupts();

    Serial.print("[ESP-NOW] Peso recibido de la balanza: ");
    Serial.print(paqueteLocal.pesoKg, 2);
    Serial.println(" kg");

    if ((esperandoPesaje || esperandoAckBalanza) && strlen(caravanaPendiente) > 0) {
      enviarRfidYPesoPorBluetooth(caravanaPendiente, paqueteLocal.pesoKg);
      esperandoAckBalanza = false;
      esperandoPesaje = false;
      caravanaPendiente[0] = '\0';
      parpadearLed(3, 60);
    } else if (strlen(paqueteLocal.rfid) > 0) {
      enviarRfidYPesoPorBluetooth(paqueteLocal.rfid, paqueteLocal.pesoKg);
      esperandoAckBalanza = false;
      esperandoPesaje = false;
      caravanaPendiente[0] = '\0';
      parpadearLed(3, 60);
    } else {
      Serial.println("[MODO SOLO PESO] Enviando peso aislado a la aplicación...");
      enviarSoloPesoPorBluetooth(paqueteLocal.pesoKg);
      parpadearLed(2, 80);
    }
  }

  if (esperandoPesaje && (ahora - tiempoLecturaRfid >= TIEMPO_MAX_ESPERA_PESO_MS)) {
    Serial.println("[TIMEOUT PESAJE] No se recibió peso en 20s. Enviando solo RFID...");
    enviarSoloRfidPorBluetooth(caravanaPendiente);
    esperandoPesaje = false;
    caravanaPendiente[0] = '\0';
    parpadearLed(2, 100);
  }

  if (esperandoAckBalanza || esperandoPesaje) {
    digitalWrite(PIN_LED_STATUS, LOW);
  } else if (!bleClienteConectado) {
    if (ahora - ultimoDestelloBle >= 3000) {
      ultimoDestelloBle = ahora;
      digitalWrite(PIN_LED_STATUS, LOW);
      delay(25);
      digitalWrite(PIN_LED_STATUS, HIGH);
    }
  } else {
    digitalWrite(PIN_LED_STATUS, HIGH);
  }
}
