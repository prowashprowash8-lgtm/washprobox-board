#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// --- 1. CONFIGURATION RÉSEAU ---
const char* WIFI_SSID = "link";
const char* WIFI_PASSWORD = "123456789";

// --- 2. CONFIGURATION SUPABASE ---
const char* SUPABASE_URL = "https://ftechtqyocgdabfkmclm.supabase.co";
const char* SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0ZWNodHF5b2NnZGFiZmttY2xtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3ODIwNjIsImV4cCI6MjA4ODM1ODA2Mn0.JJ3XgrH5u1nfUH9HADiEAd_KOfcDyNQHt_D_MykS3k4";

const char* ESP32_ID = "WASH_PRO_001";

// --- 3. PINS ---
const int RELAIS_PIN = 4;
const int OPTO_PIN   = 5;
const int OPTO_RUNNING_STATE = LOW; // Machine tourne = LOW (INPUT_PULLUP)

// --- 4. VARIABLES D'ÉTAT & TIMERS ---
unsigned long lastHeartbeatMs = 0;
const unsigned long HEARTBEAT_MS = 5000;

unsigned long lastDebugMs = 0;
const unsigned long DEBUG_MS = 2000;

bool machineWasRunning = false;

// --- 5. FONCTIONS ---

void sendHeartbeat() {
  HTTPClient hb;
  hb.begin(String(SUPABASE_URL) + "/rest/v1/rpc/register_esp32_heartbeat");
  hb.addHeader("apikey", SUPABASE_ANON);
  hb.addHeader("Authorization", "Bearer " + String(SUPABASE_ANON));
  hb.addHeader("Content-Type", "application/json");
  hb.POST("{\"p_esp32_id\":\"" + String(ESP32_ID) + "\"}");
  hb.end();
}

// Optocoupleur détecte démarrage → "Non disponible" sur l'app
void sendSetMachineOccupied() {
  HTTPClient http;
  http.begin(String(SUPABASE_URL) + "/rest/v1/rpc/set_machine_occupied");
  http.setTimeout(5000);
  http.addHeader("apikey", SUPABASE_ANON);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_ANON));
  http.addHeader("Content-Type", "application/json");
  int code = http.POST("{\"p_esp32_id\":\"" + String(ESP32_ID) + "\"}");
  if (code == 200 || code == 204) {
    Serial.println(">>> ETAT : DEMARRAGE DETECTE -> Machine OCCUPEE sur l'app <<<");
  } else {
    Serial.printf("[Occupied] Erreur HTTP %d\n", code);
  }
  http.end();
}

// Optocoupleur détecte arrêt → "Disponible" sur l'app
void sendReleaseMachine() {
  HTTPClient http;
  http.begin(String(SUPABASE_URL) + "/rest/v1/rpc/release_machine");
  http.setTimeout(5000);
  http.addHeader("apikey", SUPABASE_ANON);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_ANON));
  http.addHeader("Content-Type", "application/json");
  int code = http.POST("{\"p_esp32_id\":\"" + String(ESP32_ID) + "\"}");
  if (code == 200 || code == 204) {
    Serial.println(">>> ETAT : ARRET DETECTE -> Machine LIBEREE sur l'app <<<");
  } else {
    Serial.printf("[Release] Erreur HTTP %d\n", code);
  }
  http.end();
}

bool isMachineRunning() {
  int count = 0;
  for (int i = 0; i < 10; i++) {
    if (digitalRead(OPTO_PIN) == OPTO_RUNNING_STATE) count++;
    delay(5);
  }
  return count > 7;
}

void updateCommandStatus(const char* id) {
  HTTPClient http;
  http.begin(String(SUPABASE_URL) + "/rest/v1/machine_commands?id=eq." + String(id));
  http.addHeader("apikey", SUPABASE_ANON);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_ANON));
  http.addHeader("Content-Type", "application/json");
  http.PATCH("{\"status\":\"done\"}");
  http.end();
}

// --- 6. SETUP ---

void setup() {
  Serial.begin(115200);
  pinMode(RELAIS_PIN, OUTPUT);
  digitalWrite(RELAIS_PIN, LOW);
  pinMode(OPTO_PIN, INPUT_PULLUP);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connexion WiFi...");
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println("\n[WiFi] Connecte !");

  sendHeartbeat();
  lastHeartbeatMs = millis();

  machineWasRunning = isMachineRunning();
}

// --- 7. LOOP ---

void loop() {

  // 1. Heartbeat
  if (millis() - lastHeartbeatMs >= HEARTBEAT_MS) {
    sendHeartbeat();
    lastHeartbeatMs = millis();
  }

  // 2. Lecture optocoupleur
  bool running = isMachineRunning();

  // 3. LOGIQUE : détection du changement d'état
  if (machineWasRunning && !running) {
    // Transition EN MARCHE → ARRETEE
    Serial.println("[Opto] EN MARCHE -> ARRETEE : release_machine");
    sendReleaseMachine();
  } else if (!machineWasRunning && running) {
    // Transition ARRETEE → EN MARCHE
    Serial.println("[Opto] ARRETEE -> EN MARCHE : set_machine_occupied");
    sendSetMachineOccupied();
  }

  machineWasRunning = running;

  // 4. Debug
  if (millis() - lastDebugMs >= DEBUG_MS) {
    Serial.printf("[Opto] Etat: %s\n", running ? "EN MARCHE" : "ARRETEE");
    lastDebugMs = millis();
  }

  // 5. Commandes START depuis l'app
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.setTimeout(2000);
    http.begin(String(SUPABASE_URL) + "/rest/v1/machine_commands?esp32_id=eq." + ESP32_ID + "&status=eq.pending&select=*");
    http.addHeader("apikey", SUPABASE_ANON);
    http.addHeader("Authorization", "Bearer " + String(SUPABASE_ANON));

    int httpCode = http.GET();
    if (httpCode == 200) {
      String payload = http.getString();
      DynamicJsonDocument doc(1024);
      deserializeJson(doc, payload);
      JsonArray array = doc.as<JsonArray>();

      for (JsonObject obj : array) {
        if (String((const char*)obj["command"]) == "START") {
          Serial.println(">>> APP : COMMANDE START RECUE <<<");
          digitalWrite(RELAIS_PIN, HIGH);
          delay(5000);
          digitalWrite(RELAIS_PIN, LOW);
          machineWasRunning = false; // L'opto va détecter le démarrage réel et appeler set_machine_occupied
          updateCommandStatus((const char*)obj["id"]);
        }
      }
    }
    http.end();
  }

  delay(200);
}
