# Audit de reprise Sonara Pack — MAIN + LOCAL

**17 octobre 2026 — portée : code livré dans les deux archives fournies, aucune connexion aux services de production, aucun déploiement.**

## Décision de sécurité

- **MAIN : verrouillé côté code en `PRE_V1`, paiements réels inactifs**, même si `SONARA_COMMERCIAL_MODE=COMMERCIAL` et `SONARA_MAIN_PAYMENTS_ENABLED=true` sont configurés accidentellement. Les flux Founder LIVE de MAIN restent désactivés.
- **LOCAL : V1 commerciale dépendant de la configuration locale `SONARA_COMMERCIAL_MODE=COMMERCIAL`; la clé Stripe doit être `sk_test_...`.** Aucun paiement réel activé.
- **TEST : `server-test.js` non modifié.** Les modifications des modules partagés doivent toutefois être validées avant un éventuel déploiement TEST.
- Aucun pourcentage de sécurité global n'est revendiqué. La confidentialité R2 dépend aussi d'une configuration extérieure au dépôt.

## Failles et correctifs

| Niveau | Zone et constat | Correction dans cette livraison | Fichiers concernés | Vérification |
|---|---|---|---|---|
| Critique | MAIN pouvait redevenir commercial par des drapeaux d'environnement si la clé LIVE était présente. | Refus immuable de l'activation commerciale MAIN. | `server.js`, `backend/config/commercial-mode.js` | Test de politique MAIN sous variables COMMERCIAL : OK. |
| Critique | Acquisition de playlist PRE_V1 sans vérification de la session du compte indiqué. | Session obligatoire, correspondance du compte contrôlée par middleware et handler. | `backend/security/account-security.js`, `backend/features/playlists/auto-playlist-routes.js` | Absence de session, usurpation, accès propriétaire : OK en simulation. |
| Élevé | Demandes/réponses de modération d'artiste basées sur `accountId` fourni par le client. | Session et propriété vérifiées à deux niveaux. | `backend/security/account-security.js`, `backend/features/moderation/human-review-routes.js` | Tests d'accès croisé : OK en simulation. |
| Élevé | `PATCH /api/appeals/:id/read` acceptait l'absence de `accountId`, permettant d'agir sur une autre décision. | Identifiant obligatoire et comparaison avec la session. | `server.js`, `server-local.js` | Inspection de la route et syntaxe : OK ; pas d'intégration Mongo/JSON. |
| Élevé | Attribution organique pouvait être liée à un autre compte en indiquant son identifiant. | Liaison exigeant une session du compte concerné. | `backend/security/account-security.js`, `backend/features/growth/organic-visibility.js` | Accès croisé et absence de session : OK en simulation. |
| Critique | Le proxy des images privées `/uploads/feedback/...jpg` pouvait laisser passer les JPEG, PNG et WebP malgré une liste d'exclusion ; les preuves étaient insuffisamment cloisonnées. | Liste positive de dossiers publics autorisés pour les images ; refus des autres fichiers. | `backend/security/private-media.js` | Test de routage reproduisant la faille puis correction : OK. |
| Élevé | Informations de stockage ou preuves parfois incluses dans le catalogue public. | Suppression des champs source ZIP/R2, pièces de création et identifiants de banque ; remappage audio vers tickets/previews, avec revérification de la session émettrice. | `backend/security/private-media.js` | Test de sérialisation publique : OK. Attention à la compatibilité UI non testée. |
| Élevé | URL audio brute dans le catalogue SEO/les playlists automatiques. | URL d'extrait générée côté serveur, avec chemin correct dans les pages publiques SEO. | `backend/features/growth/organic-visibility.js`, `backend/features/playlists/auto-playlists.js` | Tests source/syntaxe ; tests navigateur et HTTP non réalisés. |
| Élevé | Ancien écran de bibliothèque lançait le ZIP par `/uploads` ou `/downloads`, voies maintenant bloquées. | Passage par `/api/downloads/prepare` puis URL à usage contrôlé. | `app/js/user/library/download.js` | Syntaxe OK, parcours écran réel non testé. |
| Moyen | Mot de passe de longueur non limitée à certaines opérations, amplifiant le coût de `scrypt`. | Limite à 128 caractères à la vérification et au changement de mot de passe. | `backend/security/account-security.js`, `server.js`, `server-local.js` | Tests unitaires et syntaxe OK. |
| Moyen | Bypass Founder sur toutes les routes `PATCH /api/users/*` dès qu'un en-tête quelconque existait. | Exception restreinte à la route de modération déjà protégée par `requireFounderKey`. | `backend/security/account-security.js` | Test en-tête frauduleux sur une autre route : OK. |
| Critique — hors Sonara | L'archive Founder fournie contenait une vraie valeur de clé dans un fichier d'exemple et un mot de passe de messagerie dans une ancienne copie locale du serveur Sonara. | Remplacement par des variables d'environnement dans **un correctif Founder distinct**, sans toucher aux finances. | `Founder/sonara-bridge/A-AJOUTER-DANS-SONARA.env`, `Founder/sonara-bridge/server-local.js` | Inspection et vérification de syntaxe OK ; **révocation et rotation des secrets impératives hors code**. |

## Tests réellement exécutés

- `npm test` avant correction : **65/65** réussis.
- `npm test` après correction : **80/80** réussis, dont les 65 précédents et 15 nouveaux cas ciblés.
- Contrôles `node --check` de **tous les JavaScript du projet Sonara**, plus des fichiers concernés dans Founder : réussis.
- Migration réelle d'un petit fichier JSON de comptes **synthétiques** : ancien mot de passe converti, hachage déjà existant inchangé, migration idempotente.
- Session expirée/révoquée et usurpation de compte : simulations backend.
- Tentative d'accès au compte bancaire d'un autre artiste : test automatique existant du middleware, **pas de requête Stripe Connect réelle**.
- Accès brut à MP3, ZIP, image privée : simulation directe des handlers Express (`/uploads`), avec validation de refus/redirection.
- Prévisualisation publique : génération d'un **audio de 42 secondes**, extraction réelle FFmpeg d'environ 30 secondes, longueur vérifiée par FFprobe.
- Écoute après acquisition / révocation ultérieure : simulation du ticket média, de la session logout révoquée et de la disparition d’acquisition, pas de véritable objet R2 téléchargé.
- Stripe TEST LOCAL : tests existants de règles de checkout ; **pas de paiement Stripe TEST complet en ligne**.
- Modération/publication : tests unitaires déjà présents ; **pas de bout-en-bout Founder ↔ Sonara**.
- Compatibilité financière : contrôle du mode MAIN désactivé et de l'absence de changements aux règles de commission et au registre Founder ; **pas de replay réel de webhooks ni de rapprochement financier avec Founder**.

## Vérifications NON réalisées — bloquantes avant déploiement

1. Démarrer réellement MAIN avec son MongoDB, ses variables Render, son bucket R2 et ses domaines ; vérifier login/OTP, banque Connect, comptes séparés, bibliothèques, média et fichiers existants.
2. Confirmer dans Cloudflare **l'absence d'accès public** aux buckets R2 contenant originaux, ZIP, MIDI, captures et justificatifs, y compris domaines personnalisés, liens `r2.dev`, CDN et URLs historiques. Le serveur ne peut pas protéger une URL R2 qui reste publique.
3. Exécuter l'achat complet Stripe **TEST** en LOCAL : création checkout, redirection, webhook signé, idempotence, confirmation, attribution et téléchargement.
4. Exécuter les parcours avec navigateur sur MAIN/LOCAL : inscription, connexion migration/OTP, changement de compte, publication/modération, playlists, lecteur (Range/seek), achat, téléchargement mobile/desktop, bibliothèque.
5. Tester les échanges Founder sur les trois environnements avec des secrets indépendants : absence de mélange de comptes, événements, recettes, commissions et états juridiques.
6. Installer et auditer les dépendances avec accès réseau : `npm ci --offline` a échoué car une dépendance n'était pas dans le cache, donc aucun serveur Express complet n'a pu être démarré ici.
7. Auditer XSS/CSP : le frontend historique comporte des scripts inline, la CSP n'est pas stricte ; les tokens d'accès sont encore en `localStorage`, vulnérables en cas de XSS. Prévoir une migration de session/cookies et CSP, validée sur les 16 langues.
8. Tester plusieurs processus/instances : sessions et tickets média temporaires doivent être cohérents et révoquables ; actuellement plusieurs éléments sont en mémoire de processus. Les limites anti-abus ne sont pas globales entre instances.
9. **Faire tourner les secrets exposés dans les archives antérieures**, révoquer l'ancien mot de passe applicatif de messagerie et remplacer la clé Founder dans chaque environnement avant tout usage, sans publier les nouvelles valeurs dans le dépôt.
10. Confirmer que les ZIP sont accompagnés de sauvegardes des vraies données et `.env` hors dépôt ; cette livraison ne doit **pas** écraser les bases ni les fichiers originaux.

## Livraison et sécurité opérationnelle

- Projet Sonara complet : structure originale préservée, aucune base utilisateur réelle ni `.env.prod`, `.env.local` ou `.env.test` insérés.
- ZIP différentiel Sonara : chemins réels à la racine (`app/...`, `backend/...`, etc.).
- Correctif Founder minimal : uniquement deux fichiers d'exemple/legacy expurgés de secrets. Le code financier Founder, ses commisssions, ses comptes et ses données ne sont pas modifiés.
- TEST n'a pas été déployé ni modifié directement ; MAIN et LOCAL ne sont pas déployés.

**Conclusion :** progrès de sécurité mesurable sur le code, mais **validation de mise en production NON acquise**. Le premier verrou opérationnel est la confidentialité R2 et la rotation des secrets ; le second est l'intégration réelle avec Mongo, Stripe TEST et les navigateurs.

---

## Correctif additionnel de livraison — erreurs `MODULE_NOT_FOUND` MAIN + LOCAL

Suite au signalement de démarrage Windows, la cause identifiée est un **ZIP incrémental incomplet** : les nouveaux `server.js` et `server-local.js` importent `./backend/security/api-hardening` et d'autres modules, mais l'ancien ZIP « fichiers modifiés » ne transportait pas tous les fichiers `backend/security/`. Le ZIP complet antérieur les contenait bien.

Le ZIP différentiel corrigé inclut **l'intégralité de `backend/security/`**, et pas seulement les fichiers modifiés pendant la dernière passe de sécurité. Un test de résolution des imports transitive depuis les deux serveurs a été ajouté à `npm test` pour prévenir cette omission : **86/86 tests réussis**, dont 6 nouveaux contrôles de présence / chargement / protections API. Aucun changement supplémentaire de règles financières ou de sécurité des routes n'a été effectué. Consulter `CORRECTIF-DEMARRAGE-MAIN-LOCAL.md` pour installer correctement le patch sur Windows.

Cette correction valide la **présence des modules**, non le démarrage avec les services tiers : le test Express + Mongo + R2 + Stripe TEST demeure non réalisé dans cette session.
