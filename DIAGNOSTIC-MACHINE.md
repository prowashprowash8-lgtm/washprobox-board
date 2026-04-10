# Diagnostic : la machine ne démarre pas

## Checklist rapide

### 1. L'ID correspond-il ?
- **ESP32** (dans le code Arduino) : `ESP32_ID = "WASH_PRO_001"`
- **Dashboard** : la machine doit avoir `esp32_id = "WASH_PRO_001"` (exactement)
- **App** : utilise l'`esp32_id` de la machine sélectionnée

→ Vérifie dans Supabase → Table `machines` que la machine a bien `esp32_id = "WASH_PRO_001"`

### 2. La commande est-elle bien insérée ?
Dans Supabase → Table Editor → `machine_commands` :
- Après avoir cliqué "Payer" (app) ou "Lancer le cycle" (board), une nouvelle ligne doit apparaître
- `esp32_id` = WASH_PRO_001
- `status` = pending
- `command` = START

Si aucune ligne n'apparaît → problème d'insertion (RLS, RPC, etc.)

### 3. Exécuter le fix SQL
Le dashboard peut être bloqué par les permissions. Exécute dans Supabase → SQL Editor :

```sql
DROP POLICY IF EXISTS "Authenticated users can insert commands" ON machine_commands;
CREATE POLICY "Anon can insert commands"
  ON machine_commands FOR INSERT TO anon WITH CHECK (true);
```

### 4. Côté App (paiement)
- Tu dois être **connecté**
- Pour payer gratuitement : utilise un **code promo valide**
- La carte bancaire n'est pas encore activée ("Coming soon")

### 5. Côté ESP32
- Vérifie le Moniteur Série (115200 baud) : tu dois voir "Heartbeat OK" toutes les 5 s
- Quand une commande est envoyée : ">>> CLIC INSTANTANÉ ! <<<"
- Si tu ne vois rien : l'ESP32 ne reçoit pas la commande (vérifier esp32_id, WiFi, Supabase)

### 6. Câblage relais ↔ machine
- Le relais est sur la broche D4
- L'impulsion dure 1 seconde
- Vérifie que le relais est bien connecté au bon endroit sur la machine (borne "Start" ou équivalent)
