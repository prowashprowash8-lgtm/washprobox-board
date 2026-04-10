# Diagnostic : clic Payé → relais ne se déclenche pas

## Chaîne complète

```
App "Payé" + code promo
  → validateAndUsePromoCode (RPC use_promo_code)
  → createTransactionAndStartMachine (RPC create_transaction_and_start_machine)
  → INSERT transactions + INSERT machine_commands (esp32_id, command='START', status='pending')

ESP32 (poll toutes les 1 s)
  → GET machine_commands?esp32_id=eq.WASH_PRO_001&status=eq.pending
  → Si commande START trouvée : relais HIGH 1 s (ou 2 s si tu as modifié), puis LOW
  → PATCH status=done
```

---

## Vérifications à faire (dans l'ordre)

### 1. L'app affiche-t-elle une erreur ?

Après avoir entré le code promo et cliqué "Appliquer" :
- **"Code invalide"** → le code promo n'est pas valide (use_promo_code)
- **"Erreur lors du démarrage"** ou autre → la RPC create_transaction_and_start_machine a échoué (permissions, contraintes)
- **"Code accepté !"** → la RPC a réussi, la commande devrait être en base

### 2. La commande est-elle en base ?

Supabase → Table Editor → `machine_commands` :
- Après un paiement réussi, une nouvelle ligne doit apparaître
- `esp32_id` = WASH_PRO_001
- `status` = pending (puis done après que l'ESP32 l'ait traitée)

**Si aucune ligne** → l'INSERT a échoué (RLS, RPC, contraintes). Exécuter `supabase-fix-paiement-complet.sql`.

### 3. L'ESP32 reçoit-il la commande ?

Moniteur Série (115200 baud) :
- `Heartbeat OK (JE SUIS LÀ)` toutes les 5 s → WiFi OK
- `>>> CLIC INSTANTANÉ ! <<<` → commande reçue, relais activé

**Si pas de "CLIC INSTANTANÉ"** alors qu'une ligne pending existe en base :
- Vérifier que `esp32_id` en base = `ESP32_ID` dans le firmware (WASH_PRO_001)
- Vérifier que l'ESP32 est bien connecté au WiFi

### 4. Le relais réagit-il au test de démarrage ?

Au boot, le firmware fait : `digitalWrite(HIGH)` 200 ms puis `LOW`.
- Si le relais ne claque pas au démarrage → problème matériel (câblage, relais, D4)

---

## Fix SQL à exécuter

Si l'app dit "Code accepté" mais rien ne se passe, ou si tu as des erreurs de permission :

→ Exécuter `supabase-fix-paiement-complet.sql` dans Supabase → SQL Editor
