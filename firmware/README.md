# Firmware WashPro - ESP32 BLE

Firmware Arduino pour ESP32 qui reçoit la commande "START" du tableau de bord et déclenche le relais de la machine à laver.

## Prérequis

- **Carte** : ESP32 (Dev Module, NodeMCU-32S, etc.)
- **IDE** : Arduino IDE ou PlatformIO
- **Bibliothèque** : ESP32 BLE (incluse dans le core ESP32)

## Installation

1. Ouvrir Arduino IDE
2. **Fichier → Préférences** : ajouter dans "URLs de gestionnaire de cartes supplémentaires" :
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
3. **Outils → Carte → Gestionnaire de cartes** : installer "esp32" par Espressif
4. **Outils → Carte** : sélectionner "ESP32 Dev Module" (ou votre modèle)
5. Ouvrir `WashPro_ESP32_BLE.ino` et téléverser

## Configuration

Dans le fichier `.ino`, modifier :

| Variable    | Description                                      | Exemple    |
|------------|---------------------------------------------------|------------|
| `BLE_NAME` | Nom BLE visible (doit correspondre à l'ID dans le dashboard) | `WASH_307` |
| `RELAY_GPIO` | Broche GPIO du relais                          | `4`        |
| `PULSE_MS` | Durée de l'impulsion en millisecondes            | `2000`     |

**Important** : Le `BLE_NAME` doit être **identique** ou **commencer par** l'ID ESP32 que vous avez renseigné dans le dashboard (ex. machine "307" → `esp32_id` = "WASH_307" ou "307").

## Câblage

```
ESP32 GPIO 4 ──► Relais (entrée)
Relais (sortie) ──► Machine à laver (bouton start / contacteur)
```

Utiliser un relais 5V compatible 3.3V ou un module relais avec optocoupleur.

## Fonctionnement

1. L’ESP32 diffuse en BLE avec le nom configuré
2. Sur le dashboard, clic sur **Payé — Lancer le cycle**
3. Le navigateur se connecte en BLE et envoie "START"
4. L’ESP32 reçoit "START", active le relais pendant `PULSE_MS`, puis le coupe

## Débogage

Ouvrir le **Moniteur série** (115200 baud) pour voir les messages :
- `[WashPro] BLE prêt - En attente de connexion...`
- `[WashPro] START reçu - Déclenchement du relais`
- `[WashPro] Cycle lancé`
