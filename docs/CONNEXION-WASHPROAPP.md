# Connexion WashPro App ↔ WashPro Board

## Prérequis

Les deux applications doivent utiliser **le même projet Supabase** (même URL et clé anon dans le `.env`).

## 1. Exécuter le SQL dans Supabase

Dans **Supabase** → **SQL Editor** → exécuter :

```
supabase-board-read-profiles.sql
```

Cela permet au board (admins connectés) de lire la table `profiles` créée par l'app.

## 2. Schéma attendu (washproapp)

- **profiles** : `id`, `email`, `first_name`, `last_name`, `created_at`, `last_login_at`
- **transactions** : `user_id`, `machine_id`, `emplacement_id`, `amount`, `status`, `refunded_at`, `refund_reason`
- **machines** : `name` ou `nom`, `emplacement_id`
- **emplacements** : `name` ou `nom`

## 3. Fonctionnement

1. Un client crée un compte sur l'app WashPro → enregistré dans `profiles`
2. Le client paie une machine → transaction créée avec `user_id`
3. Sur le board, onglet **Utilisateurs** → liste des profils
4. Clic sur un utilisateur → historique (laverie, machine, montant)
5. Bouton **Rembourser** → appelle `refund_transaction` ou met à jour `status='refunded'`
