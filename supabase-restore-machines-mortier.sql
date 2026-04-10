-- OPTION A : Insert par nom (exécute ce bloc seul)
INSERT INTO machines (nom, esp32_id, emplacement_id, prix_centimes)
SELECT '307', 'WASH_307', id, 300 
FROM emplacements 
WHERE name ILIKE '%mortier%' 
LIMIT 1;

-- Si rien ne s'insère, exécute d'abord ce diagnostic pour voir tes laveries :
-- SELECT id, name FROM emplacements;

-- OPTION B : Insert avec l'ID explicite (remplace l'UUID par celui de mortier)
-- INSERT INTO machines (nom, esp32_id, emplacement_id, prix_centimes)
-- VALUES ('307', 'WASH_307', 'colle-l-id-ici'::uuid, 300);
