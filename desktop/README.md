# wacrm Local — prototype de contacts sans Docker

Ce prototype Windows contient un **carnet de contacts local**, avec création,
modification, recherche et suppression, des notes internes par contact, une
boîte de réception locale avec brouillons, et l'export et la restauration d'une
sauvegarde SQLite. Il utilise SQLite intégré à Electron ; aucun
Docker, serveur Supabase ou connexion Internet n'est nécessaire pour ces fonctions.
Les données sont conservées dans le dossier de données de l'utilisateur Windows,
et non dans le dossier d'installation. Les données et sauvegardes ne sont pas
chiffrées : protégez votre session Windows et conservez les sauvegardes en lieu sûr.
L'export refuse d'écraser un fichier existant. La restauration demande confirmation,
vérifie le fichier et crée une copie automatique des données précédentes dans le
sous-dossier `data/backups` du dossier utilisateur de l'application. La restauration
remplace les contacts, les notes et les brouillons actuels ; elle ne fusionne pas
les données.

**Ce n'est pas encore wacrm complet.** Cette première interface locale est
séparée de l'interface originale, qui reste intacte. Les brouillons restent sur
le PC et ne sont pas envoyés : la connexion WhatsApp et la réception de messages
ne sont pas implémentées. Les pièces jointes, les automatisations et les autres
fonctions de l'application d'origine n'ont pas encore été portées. L'interface originale
utilise Supabase et ne fonctionne pas encore avec la base SQLite. Ne pas utiliser
ce prototype comme CRM de production ni pour conserver des données critiques.

## Développement et tests

Dans `desktop/`, `npm ci`, `npm test`, puis `npm start`. Le test interface
`npm run test:e2e` nécessite un environnement graphique et lance Electron avec
un profil temporaire. `npm run dist:win -- --publish never` construit le
prototype Windows. Le workflow GitHub teste le stockage sous Windows avec Node
et Electron, teste les parcours visuels, puis génère un installateur de test.
L'installateur est non signé et peut déclencher un avertissement Windows.

## Étapes à venir

- Continuer le port des fonctionnalités et rapprocher l'interface locale de
  l'interface wacrm d'origine, sans prétendre que tout est déjà disponible.
- Renforcer les sauvegardes et protéger les secrets Meta.
- Après validation, connecter l'API Meta et un webhook HTTPS public sécurisé.
  WhatsApp nécessite Internet ; aucun tunnel ni secret Meta n'est fourni ici.

Les fichiers `main.cjs`, `config.cjs` et `scripts/prepare-bundle.cjs` sont
l'ancien socle expérimental Supabase/Next. Ils ne sont pas utilisés par le
prototype SQLite actuel et pourront être retirés quand la transition sera
terminée.
