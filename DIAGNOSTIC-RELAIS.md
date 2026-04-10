# Diagnostic : le relais ne se met plus en route

## Chaîne complète (ordre des étapes)

```
1. Board : clic "Lancer un cycle" 
   → INSERT dans machine_commands (esp32_id = machine.esp32_id, command = START, status = pending)

2. ESP32 : poll toutes les 1 s
   → GET machine_commands?esp32_id=eq.XXX&status=eq.pending

3. ESP32 : si une commande START trouvée
   → digitalWrite(RELAIS_PIN, HIGH) pendant 1 s
   → PATCH pour marquer status = done
```

---

## Cause la plus probable : **mismatch esp32_id**

| Où | Valeur actuelle |
|----|-----------------|
| **Firmware** (ligne 13) | `ESP32_ID = "WASH_PRO_001"` |
| **Machine en base** (mortier) | `esp32_id = "WASH_307"` |

→ Le board insère des commandes avec `esp32_id = "WASH_307"`.
→ L’ESP32 interroge avec `esp32_id = eq.WASH_PRO_001`.
→ L’ESP32 ne trouve jamais les commandes → le relais ne se déclenche pas.

### Vérification rapide

Dans Supabase → Table `machines` : quelle est la valeur de `esp32_id` pour ta machine ?

### Correction

**Option A** – Adapter le firmware à ta machine (recommandé si tu utilises WASH_307) :

```cpp
const char* ESP32_ID = "WASH_307";  // doit correspondre à machines.esp32_id
```

**Option B** – Adapter la machine en base au firmware :

```sql
UPDATE machines SET esp32_id = 'WASH_PRO_001' WHERE esp32_id = 'WASH_307';
```

---

## Autres causes possibles

### 1. RLS bloque l’INSERT (board)

Si tu vois l’erreur : `new row violates row-level security policy for table "machine_commands"` :

→ Exécuter `supabase-restore-machine-commands.sql` dans Supabase → SQL Editor.

### 2. Commande jamais insérée

Dans Supabase → Table `machine_commands` : après un clic sur "Lancer un cycle", une nouvelle ligne apparaît-elle ?

- **Non** → problème d’INSERT (RLS, GRANT, etc.)
- **Oui** → vérifier que `esp32_id` de cette ligne = `ESP32_ID` dans le firmware.

### 3. ESP32 ne reçoit pas les commandes

Moniteur Série (115200 baud) :

- `Heartbeat OK (JE SUIS LÀ)` toutes les 5 s → WiFi + Supabase OK
- `>>> CLIC INSTANTANÉ ! <<<` → commande reçue, relais activé

Si tu vois le heartbeat mais jamais le clic → mismatch `esp32_id` ou commande non insérée.

### 4. Problème matériel (relais)

Le firmware fait un test au démarrage (lignes 56–58) : relais HIGH 200 ms puis LOW.

Si le relais ne réagit pas à ce test → câblage, alimentation ou relais défaillant.

---

## Résumé

1. Vérifier que `ESP32_ID` (firmware) = `esp32_id` (table `machines`).
2. Vérifier qu’une ligne apparaît dans `machine_commands` après un clic.
3. Si erreur RLS, exécuter `supabase-restore-machine-commands.sql`.
