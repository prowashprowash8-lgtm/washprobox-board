/*
 * WashPro ESP32 - Firmware BLE pour laverie
 * 
 * Quand le tableau de bord envoie "START" via Bluetooth,
 * le relais se déclenche pour lancer le cycle de la machine.
 * 
 * Configuration :
 * - Nom BLE : doit correspondre à l'ID ESP32 dans le dashboard (ex: WASH_307)
 * - Relais : GPIO 4 (modifiable ci-dessous)
 * - Durée impulsion : 2 secondes (modifiable ci-dessous)
 * 
 * Bibliothèque requise : ESP32 BLE (incluse dans le core ESP32)
 * Carte : ESP32 Dev Module (ou compatible)
 */

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// ========== CONFIGURATION ==========
#define RELAY_GPIO     4    // Broche du relais
#define PULSE_MS    2000    // Durée de l'impulsion en ms (2 secondes)
#define BLE_NAME "WASH_307"  // Doit correspondre à l'ID ESP32 dans le dashboard !

// UUIDs utilisés par le tableau de bord web
#define SERVICE_UUID        "0000ff00-0000-1000-8000-00805f9b34fb"
#define CHARACTERISTIC_UUID "0000ff02-0000-1000-8000-00805f9b34fb"

BLEServer* pServer = nullptr;
BLECharacteristic* pCharacteristic = nullptr;
bool deviceConnected = false;
bool oldDeviceConnected = false;

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) override { deviceConnected = true; }
  void onDisconnect(BLEServer* pServer) override { deviceConnected = false; }
};

class MyCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* pCharacteristic) override {
    std::string value = pCharacteristic->getValue();
    
    if (value.length() >= 5) {
      String cmd = "";
      for (int i = 0; i < (int)value.length(); i++) {
        cmd += (char)value[i];
      }
      
      // Commande "START" reçue depuis le bouton Payé
      if (cmd.startsWith("START")) {
        Serial.println("[WashPro] START reçu - Déclenchement du relais");
        
        digitalWrite(RELAY_GPIO, HIGH);   // Active le relais
        delay(PULSE_MS);
        digitalWrite(RELAY_GPIO, LOW);    // Désactive le relais
        
        Serial.println("[WashPro] Cycle lancé");
      }
    }
  }
};

void setup() {
  Serial.begin(115200);
  Serial.println("[WashPro] Démarrage...");

  pinMode(RELAY_GPIO, OUTPUT);
  digitalWrite(RELAY_GPIO, LOW);

  BLEDevice::init(BLE_NAME);
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new ServerCallbacks());

  BLEService* pService = pServer->createService(SERVICE_UUID);

  pCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_WRITE
  );
  pCharacteristic->setCallbacks(new MyCallbacks());
  pCharacteristic->addDescriptor(new BLE2902());

  pService->start();

  BLEAdvertising* pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);
  pAdvertising->setMaxPreferred(0x12);
  BLEDevice::startAdvertising();

  Serial.println("[WashPro] BLE prêt - En attente de connexion...");
  Serial.print("[WashPro] Nom visible : ");
  Serial.println(BLE_NAME);
}

void loop() {
  // Reconnexion automatique après déconnexion
  if (!deviceConnected && oldDeviceConnected) {
    delay(500);
    pServer->startAdvertising();
    Serial.println("[WashPro] Redémarrage de la publicité BLE");
    oldDeviceConnected = deviceConnected;
  }
  if (deviceConnected && !oldDeviceConnected) {
    oldDeviceConnected = deviceConnected;
  }

  delay(100);
}
