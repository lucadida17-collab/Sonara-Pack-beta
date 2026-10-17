# Mise à jour de reprise — 17/10/2026

Le bilan et les limites les plus récents sont dans `AUDIT-SECURITE-MAIN-LOCAL-2026-10-17.md`. MAIN est désormais forcé en PRE_V1 côté code. Les 80 tests automatiques ne remplacent pas une validation intégrée des services.

---

# Sonara Pack — Sécurité MAIN (Pre-V1) et LOCAL (V1 commerciale TEST)

## Portée
- **MAIN** reste en `PRE_V1` : aucune activation de paiement réel par ce correctif.
- **LOCAL** reste en `COMMERCIAL / V1_DYNAMIC`, Stripe **TEST** uniquement.
- **TEST** n'est pas modifié. Aucun déploiement Render/production n'a été fait depuis l'archive.

## Modifications côté code
- Mots de passe enregistrés avec `scrypt` salé : conversion des anciens comptes au démarrage MAIN/LOCAL, puis à la connexion si nécessaire. Les anciens comptes restent reconnus sans réinitialisation.
- Sessions opaques aléatoires : le serveur enregistre leur empreinte SHA-256 et leur date d'expiration ; reconnexion et restauration contrôlées côté serveur. Les anciens jetons non vérifiés et profils simplement présents dans `localStorage` ne donnent plus de droits. **Se reconnecter après installation.**
- Middleware commun MAIN/LOCAL : authentification sur les opérations de compte, profil, artiste, banque Stripe, checkout, préparation des téléchargements et autres actions sensibles. Contrôle de la correspondance identité/compte pour prévenir les accès croisés.
- Confirmation du checkout Stripe réservée au compte ayant réellement initié l'achat ; les webhooks Stripe signés continuent leur traitement indépendant.
- Fichiers originaux MP3/ZIP/MIDI/DAW non exposés directement par `/uploads`. Covers publiques autorisées. Preview publique recoupée à **30 s maximum** par le backend ; média complet uniquement avec un ticket temporaire pour compte autorisé, droits revérifiés à chaque lecture.
- Aperçus MIDI publics réduits ; flux d'export de contenu complet et preuves de modération conservés derrière les routes dédiées.
- Validation des uploads d'images de profil (type, taille et noms sécurisés), limites anti-abus sur certaines routes d'authentification, filtrage de chemins sensibles et en-têtes HTTP renforcés.
- `LOCAL` limite les connexions au loopback par défaut ; les essais depuis un autre appareil nécessitent l'autorisation explicite `SONARA_LOCAL_ALLOW_LAN=true` et une origine CORS listée.

## Installation sans écraser tes données
1. **Sauvegarder** les `.env.local`, `.env.prod`, `.env.test`, `data/` et les originaux `uploads/` / R2 AVANT toute mise à jour.
2. Copier les fichiers de ce ZIP dans le projet en **conservant les données et .env locaux**. Ces derniers sont intentionnellement ABSENTS des ZIPs de livraison.
3. MAIN : déployer uniquement les changements de code, conserver les variables Render et le mode Pre-V1 actuel ; ne PAS activer le checkout LIVE.
4. LOCAL : `npm install` puis `npm run start:local`. Garder la clé Stripe `sk_test_...` et vérifier compte bancaire, création de pack, achat et bibliothèque.
5. **Tous les utilisateurs doivent se reconnecter** une fois après déploiement afin d'obtenir leur session serveur vérifiée.
6. Tester à la main avec un compte artiste ET un autre compte non autorisé : accès banques, changement de profil, achat TEST, preview 30 s, lecture après acquisition, téléchargement ZIP.

## Mesures externes indispensables
- **R2 doit être privé** : désactiver tout accès public direct aux buckets contenant audio, fichiers complets, ZIP et pièces de modération ; une URL publique R2/CDN contournerait le serveur, quelles que soient ses protections.
- Les tickets média temporaires sont actuellement conservés en mémoire de processus ; lors d'un redémarrage, le lecteur doit rafraîchir son catalogue. Pour plusieurs instances, utiliser un magasin de sessions partagé.
- Les jetons de connexion restent pour l'instant conservés dans le stockage navigateur ; le renforcement CSP strict / cookies `HttpOnly` demandera une migration spécifique pour ne pas casser le code inline historique. **Ne pas qualifier cette version d'inviolable.**
- Vérifier que le dépôt GitHub et les anciennes archives publiées n'exposent aucune vraie clé, et **révoquer/renouveler** toute clé anciennement exposée.
- Faire un audit de dépendances (`npm audit`) et un test d'intégration avec Node, Mongo/R2 et Stripe TEST en ligne ; impossible à certifier dans cet environnement sans les services connectés.

## Vérifications automatiques
Commande : `npm test` (65 cas réussis lors de la création du ZIP) ; contrôles `node --check server.js` et `node --check server-local.js`.
Ces tests portent surtout sur le code et les composants de sécurité, PAS sur un test d'intrusion du site en ligne.
