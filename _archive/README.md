# Archive

Anciens scripts SQL (itérations de correctifs, versions superseded, scripts ponctuels à
usage unique). Déplacés ici le 2026-07-06 suite à un audit externe qui notait plus de 100
fichiers `.sql` sans ordre clair à la racine du dépôt.

**Ne rejouer aucun de ces fichiers.** Certains décrivent des états de sécurité dépassés et
dangereux (ex. `supabase-machines-update-policy.sql`, `supabase-fix-promo-codes-board.sql`,
`supabase-refund-requests.sql` accordaient un accès en écriture à `anon` sans restriction —
corrigé depuis, voir `../fix-customer-write-access-lockdown.sql` et
`../fix-refund-requests-rls.sql` à la racine). Gardés uniquement pour l'historique.

L'état réel de la base est dans Supabase (vérifiable via `supabase db query --linked`), pas
dans ces fichiers.
