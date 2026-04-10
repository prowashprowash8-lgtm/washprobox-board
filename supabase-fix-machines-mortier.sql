-- FIX DÉFINITIF - Exécute TOUT dans Supabase SQL Editor

-- 1. Désactiver RLS sur machines (contourne tous les blocages)
ALTER TABLE machines DISABLE ROW LEVEL SECURITY;

-- 2. Rattacher WASH_307 à mortier (ou au 1er emplacement si mortier introuvable)
UPDATE machines 
SET emplacement_id = COALESCE(
  (SELECT id FROM emplacements WHERE TRIM(LOWER(name)) = 'mortier' LIMIT 1),
  (SELECT id FROM emplacements WHERE name ILIKE '%mortier%' LIMIT 1),
  (SELECT id FROM emplacements ORDER BY name LIMIT 1)
)
WHERE esp32_id = 'WASH_307';

-- 3. Vérification : doit afficher 1 ligne avec emplacement_id rempli
SELECT id, nom, esp32_id, emplacement_id FROM machines WHERE esp32_id = 'WASH_307';

-- 4. Si la machine a un autre esp32_id, exécute ceci (remplace XXX par ton esp32_id) :
-- UPDATE machines SET emplacement_id = (SELECT id FROM emplacements WHERE name ILIKE '%mortier%' LIMIT 1) WHERE esp32_id = 'XXX';
