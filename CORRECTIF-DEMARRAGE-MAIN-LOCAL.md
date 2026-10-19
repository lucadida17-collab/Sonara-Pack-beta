# Sonara Pack — Correctif de démarrage MAIN + LOCAL (17/10/2026)

## Problème reproduit

`Error: Cannot find module './backend/security/api-hardening'` depuis `server-local.js` ou `server.js`.

**Cause identifiée :** le ZIP « fichiers modifiés » de la précédente livraison contenait les serveurs mis à jour mais omettait plusieurs nouveaux modules sous `backend/security/`, y compris `api-hardening.js`. Le ZIP **complet** précédent les contenait déjà. Il s'agit d'une erreur de **livraison/incrément**, pas d'une raison de désactiver les protections dans les serveurs.

## Ce qui change

- Le **nouveau ZIP différentiel** contient désormais **tous les modules et tests** de `backend/security/` ; les imports MAIN et LOCAL sont satisfaits.
- Le ZIP complet conserve le projet et tous ces modules sous leur vraie arborescence, sans dossier `Sonara-Pack/` supplémentaire dans l'archive.
- Ajout du test `backend/security/module-integrity.test.js` et de la commande `npm run check:modules`. Le test résout récursivement les imports locaux depuis les deux serveurs, vérifie les exports essentiels et la limitation anti-abus de l'API.
- **Aucune modification** de la logique Stripe, des commissions, du serveur TEST, de l'identité des sessions ou des règles d'accès aux fichiers dans ce correctif de démarrage.
- MAIN reste **Pre-V1**, LOCAL **Stripe TEST uniquement** ; aucun déploiement effectué.

## Installer sous Windows (PowerShell / VS Code)

1. **Sauvegarder** les `.env.*`, `data/`, `uploads/`, `downloads/` et les fichiers non suivis avant toute mise à jour.
2. Fermer les serveurs Node.
3. Ouvrir le **ZIP des fichiers modifiés corrigé** et copier **son contenu**, sans ajouter de dossier intermédiaire, à la racine réelle de ton projet, à côté de `server.js` et `server-local.js`. Fusionner les dossiers en conservant l'arborescence `backend/security/`.
4. Dans le terminal **à la racine** du projet, vérifier :

   ```powershell
   Test-Path .\backend\security\api-hardening.js
   Test-Path .\backend\security\private-media.js
   Test-Path .\backend\security\password-migration.js
   ```

   Les trois commandes doivent afficher `True`.

5. Exécuter les contrôles avant démarrage :

   ```powershell
   npm run check:modules
   npm test
   ```

6. Démarrer LOCAL avec `node server-local.js` / `npm run start:local`. Pour MAIN, utiliser `node server.js` ou le procédé de déploiement existant, **sans déployer sans validation**.

**Important :** ce correctif ne nécessite pas de retirer le `require("./backend/security/api-hardening")` et `npm install` ne peut pas créer un fichier du projet absent du disque. En revanche les dépendances tierces (`express`, `mongodb`, `stripe`, etc.) exigent bien `npm install` ou `npm ci` si elles ne sont pas installées.

## Contrôles réellement exécutés

- `npm run check:modules` : **6/6** réussis.
- `npm test` : **86/86** réussis, dont les six nouveaux cas.
- `node --check` sur MAIN, LOCAL, TEST, le test nouveau et le module API : OK.
- Contrôle de présence des modules dans les deux archives de livraison : OK.

**Non vérifié ici :** démarrage Express complet, MongoDB, R2 réel et paiement Stripe TEST de bout en bout (les dépendances tierces et les services nécessaires ne sont pas disponibles). La sécurité et les parcours réels restent soumis aux vérifications détaillées dans le rapport d'audit.
