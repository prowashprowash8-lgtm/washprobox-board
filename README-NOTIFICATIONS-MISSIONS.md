# Notifications missions

## Résumé

1. **Mission postée** → Les utilisateurs qui ont déjà utilisé les laveries concernées reçoivent une notification push.
2. **Soumission utilisateur** → L’admin reçoit une notification push quand un utilisateur envoie des photos.

---

## Mise en place

### 1. SQL (Supabase → SQL Editor)

Exécuter le fichier `supabase-mission-notifications.sql`.

### 2. Edge Function

Depuis le dossier du projet Supabase (ex. washproapp) :

```bash
supabase functions deploy mission-notifications
```

### 3. Webhook (Supabase Dashboard)

Pour les notifications admin à chaque soumission :

1. **Database** → **Webhooks** → **Create webhook**
2. **Table** : `mission_submissions`
3. **Events** : cocher **Insert**
4. **Type** : Edge Function → `mission-notifications`
5. Créer le webhook

### 4. Alertes admin sur l’app

Dans l’app WashPro, onglet **Missions** : appuyer sur **« Recevoir les alertes quand un utilisateur envoie une mission »**.  
Cela enregistre le token push de l’appareil pour recevoir les notifications de soumissions.

---

## Flux

- **Mission postée** : le board appelle l’Edge Function après création de la mission.
- **Soumission** : le webhook sur `mission_submissions` appelle l’Edge Function à chaque nouvel enregistrement.
