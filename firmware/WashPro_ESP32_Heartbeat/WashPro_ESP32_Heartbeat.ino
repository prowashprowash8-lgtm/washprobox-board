/*
 * WashPro ESP32 - Heartbeat uniquement
 * Envoie "JE SUIS LÀ" à la table esp32_heartbeat immédiatement au démarrage,
 * puis toutes les 5 secondes dans la loop.
 *
 * Utilise register_esp32_heartbeat (RPC Supabase) pour mettre à jour last_seen.
 *
 * Configuration : WiFi, Supabase URL, Anon Key, ID machine MACHINE_01
 */

#include <WiFi.h>
#include <HTTPClient.h>

// ========== CONFIGURATION ==========
const char* WIFI_SSID     = "TON_WIFI";           // À modifier
const char* WIFI_PASSWORD = "TON_MOT_DE_PASSE";    // À modifier

const char* SUPABASE_URL   = "https://ftechtqyocgdabfkmclm.supabase.co";  // À modifier
const char* SUPABASE_ANON  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0ZWNodHF5b2NnZGFiZmttY2xtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3ODIwNjIsImV4cCI6MjA4ODM1ODA2Mn0.JJ3XgrH5u1nfUH9HADiEAd_KOfcDyNQHt_D_MykS3k4";  // À modifier
const char* MACHINE_ID     = "MACHINE_01";

const unsigned long HEARTBEAT_INTERVAL_MS = 5000;  // 5 secondes

void sendHeartbeat() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/rpc/register_esp32_heartbeat";
  http.begin(url);
  http.addHeader("apikey", SUPABASE_ANON);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_ANON));
  http.addHeader("Content-Type", "application/json");

  String body = "{\"p_esp32_id\":\"" + String(MACHINE_ID) + "\"}";
  int code = http.POST(body);

  if (code == 200 || code == 204) {
    Serial.println("[Heartbeat] JE SUIS LÀ");
  } else {
    Serial.println("[Heartbeat] Erreur: " + String(code));
  }
  http.end();
}

void setup() {
  Serial.begin(115200);
  Serial.println("[Heartbeat] Démarrage...");

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\n[Heartbeat] Erreur WiFi - redémarrage dans 10s");
    delay(10000);
    ESP.restart();
  }

  Serial.println("\n[Heartbeat] WiFi connecté");
  Serial.print("[Heartbeat] IP: ");
  Serial.println(WiFi.localIP());
  Serial.print("[Heartbeat] MACHINE_ID: ");
  Serial.println(MACHINE_ID);

  // Envoi immédiat au démarrage
  sendHeartbeat();
}

void loop() {
  sendHeartbeat();
  delay(HEARTBEAT_INTERVAL_MS);
}
