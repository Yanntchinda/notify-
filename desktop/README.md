# wacrm Local — prototype expérimental sans Docker

**État : non terminé, pas un programme prêt à utiliser.** Le but est de
conserver autant que possible l'interface de wacrm dans une application Windows
avec ses données sur l'ordinateur, sans Docker ni Supabase en ligne.

## Travail réalisé

- Une enveloppe Electron expérimentale, destinée à exécuter l'interface.
- Un premier module SQLite local (`src/local-store.cjs`) avec création, lecture,
  modification et suppression de contacts. Des tests vérifient la persistance
  après fermeture, les données invalides et la protection contre une version de
  schéma plus récente. Ce fichier SQLite n'est pas chiffré.
- Une vérification GitHub Actions pour Windows : tests Node et Electron puis
  compilation du prototype de l'interface.

## Important : l'interface n'est pas encore branchée sur SQLite

Le module SQLite est un début, pas un remplacement de Supabase. L'interface
wacrm existante utilise encore Supabase pour la connexion, les requêtes, le
stockage et le temps réel. Le lancement du prototype demande toujours une
configuration Supabase locale ; **il ne répond donc pas encore à l'objectif
sans Docker**. Aucune configuration fictive ne doit être prise pour une
application fonctionnelle. La compilation CI utilise une clé de test et ne
publie pas de programme à utiliser.

## À faire

1. Relier progressivement l'interface au stockage SQLite et remplacer les
   fonctions Supabase nécessaires (authentification locale, données, fichiers et
   actualisation de l'interface). Les migrations Postgres ne sont pas directement
   compatibles SQLite ; il faut porter et tester les fonctionnalités une par une.
2. Implémenter les conversations et messages, protéger les secrets, prévoir la
   sauvegarde et la restauration et garantir la conservation des données lors
   des mises à jour. Prévoir aussi l'emplacement du fichier dans le dossier de
   données utilisateur, pas dans le dossier d'installation.
3. Construire un installateur réellement autonome et valider les parcours sur
   un PC Windows, sans Docker ni service Supabase distant.
4. Après validation, configurer l'API Meta et un webhook HTTPS public sécurisé.
   WhatsApp nécessite Internet ; aucun tunnel ni secret Meta n'est fourni ici.

## Développement

Dans `desktop/` : `npm ci` puis `npm test`. SQLite utilise l'API `node:sqlite`
intégrée à Node (v22.13 ou plus) et à la version Electron ciblée ; aucun module
SQLite externe ni conteneur n'est requis. Les tests peuvent afficher un
avertissement de fonctionnalité expérimentale selon la version de Node.

L'ancien socle de compilation Next/Electron et son installateur ne sont qu'une
preuve technique : ils doivent encore être adaptés pour utiliser SQLite.
