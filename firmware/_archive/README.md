# Archive firmware

`WashPro_ESP32_WiFi` déplacé ici le 2026-07-06 (audit externe) : contenait le vrai mot de
passe WiFi en clair et ne vérifiait aucun `DEVICE_SECRET` avant d'exécuter une commande
START — vulnérable à un démarrage de machine à distance par simple devinette de l'ID ESP32.

**Ne jamais flasher ce firmware.** La version de référence à jour (avec `DEVICE_SECRET` par
boîtier) vit dans `washproapp/firmware/washpro-esp32/washpro-esp32.ino`.
