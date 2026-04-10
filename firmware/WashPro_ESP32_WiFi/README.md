# WashPro ESP32 - Firmware WiFi

Firmware pour ESP32 qui reçoit les commandes du tableau de bord **via internet** (WiFi). Fonctionne à distance.

## Prérequis

1. **Exécuter le SQL** dans Supabase : `supabase-machine-commands.sql` (à la racine du projet)
2. **Bibliothèque ArduinoJson** : Outils → Gérer les bibliothèques → chercher "ArduinoJson" par Benoit Blanchon

## Configuration

Dans le fichier `.ino`, modifier :

| Variable | Description |
|----------|--------------|
| `WIFI_SSID` | Nom de ton réseau WiFi |
| `WIFI_PASSWORD` | Mot de passe WiFi |
| `SUPABASE_URL` | URL de ton projet (ex: `https://xxx.supabase.co`) |
| `SUPABASE_ANON` | Clé anon Supabase (voir `.env` → `VITE_SUPABASE_ANON_KEY`) |
| `ESP32_ID` | ID de la machine dans le dashboard (ex: `WASH_307`) |

## Fonctionnement

1. L'ESP32 se connecte au WiFi
2. Toutes les 5 secondes, il interroge Supabase pour les commandes en attente
3. Quand tu cliques sur "Payé" dans le dashboard, une commande est créée
4. L'ESP32 la détecte, déclenche le relais, puis marque la commande comme exécutée

## Câblage

```
ESP32 GPIO 4 ──► Relais (entrée)
Relais (sortie) ──► Machine à laver
```

## Débogage

Ouvrir le **Moniteur série** (115200 baud) pour voir :
- Connexion WiFi
- Adresse IP
- Déclenchements du relais
