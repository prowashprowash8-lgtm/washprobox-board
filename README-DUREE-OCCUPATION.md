# Gestion du statut Occupé et notifications

## Résumé des modifications

### 1. Pop-up après paiement
Dès que le paiement est validé (code promo), une pop-up demande : **"Combien de minutes sont affichées sur l'écran de la machine ?"**. L'utilisateur entre le temps (ex: 45).

### 2. Base de données
- **transactions** : colonne `estimated_end_time` (now + durée)
- **machines** : colonne `estimated_end_time` + `statut` = 'occupe'
- **RPC** `set_transaction_duration(transaction_id, minutes)` : met à jour les deux tables
- **RPC** `release_expired_machines()` : repasse les machines en 'disponible' quand le temps est écoulé

### 3. Affichage
- Machine occupée : barre rouge, texte "Occupée — X min XX s" (compte à rebours en temps réel)
- Rafraîchissement des machines toutes les 10 s
- Libération automatique à chaque chargement de la liste

### 4. Notifications Push (Expo)
- **T-10 min** : "Votre linge sera prêt dans 10 minutes !"
- **Fin du cycle** : "Le cycle est terminé, vous pouvez récupérer votre linge."

---

## Déploiement

### 1. SQL (Supabase → SQL Editor)
Exécuter dans l'ordre :
1. `supabase-machine-duration-status.sql`
2. `supabase-push-tokens.sql`

### 2. Edge Function (notifications)
```bash
cd washproapp
supabase functions deploy laundry-notifications
```

Puis configurer un **cron** dans Supabase Dashboard → Edge Functions → laundry-notifications → Triggers :
- Schedule : `* * * * *` (toutes les minutes)

### 3. App
```bash
cd washproapp
npm install   # pour expo-notifications
```

---

## Flux complet

1. Utilisateur paie (code promo) → commande START envoyée à l'ESP32 → relais clic
2. Pop-up "Combien de minutes ?" → utilisateur entre 45
3. `set_transaction_duration` → machines.statut = occupe, estimated_end_time = now + 45 min
4. Affichage : machine en rouge avec compte à rebours
5. Toutes les minutes : Edge Function libère les machines expirées + envoie les notifications
