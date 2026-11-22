# wacrm Local — socle expérimental

**État : non terminé, pas un programme installable prêt à utiliser.** Cette
première étape conserve l'interface wacrm et fournit une enveloppe Electron
pour Windows. Elle ne remplace pas Supabase, ne lance pas une base locale,
ne configure pas l'utilisateur initial et n'établit aucun tunnel Meta.
Le CRM n'a pas été testé de bout en bout sur Windows.

wacrm dépend de Postgres, Auth, Storage et Realtime de Supabase. La piste
la moins invasive à évaluer est un Supabase local compatible et les migrations
existantes ; une simple base SQLite ne suffit pas sans réécriture importante.
Ce dépôt n'embarque pas encore ces services. L'utilisation d'un Supabase local
de développement peut nécessiter Docker Desktop et une installation initiale
avec accès Internet. Cela n'a pas été validé ici.

## Fonctionnement prévu du socle

- Une seule instance démarre un serveur Next.js sur `127.0.0.1:38741`, puis
  affiche son interface dans une fenêtre isolée Electron. Le port doit être libre.
- Le serveur et le navigateur ciblent uniquement Supabase local sur
  `http://127.0.0.1:54321`. L'URL et la clé publique doivent aussi être intégrées
  lors de la compilation Next.js (les variables `NEXT_PUBLIC_*` sont figées à
  la compilation). Le manifeste `desktop-build.json` dans le bundle doit contenir
  `supabaseUrl` et `anonKey` correspondant à la configuration ci-dessous.
- Le programme attend `server.js` et les fichiers de la sortie Next standalone,
  construits **sur Windows** et placés dans `desktop/resources/standalone/`.
  Les modules natifs construits sur Linux ne doivent pas être copiés vers Windows.
- Les secrets ne sont pas inclus dans le paquet. La configuration est attendue
  dans `local-config.json` du dossier utilisateur Electron, avec les champs
  `supabaseUrl`, `anonKey`, `serviceRoleKey` et `encryptionKey` (64 caractères
  hexadécimaux). **Protéger ce fichier : il contient une clé privilégiée.**
  Une interface de configuration et un stockage protégé restent à développer.
- L'envoi et la réception WhatsApp nécessiteront Internet et la configuration
  officielle Meta ; la réception exige un webhook HTTPS public sécurisé. Ne
  jamais exposer la base, les endpoints d'administration ou le CRM entier sur
  Internet par défaut. Le tunnel n'est pas implémenté.

## Développement

Dans `desktop/`, `npm install` puis `npm test`. `npm start` lance Electron,
mais signalera l'absence de configuration et/ou de bundle tant que l'étape
Supabase local et la compilation Windows ne sont pas achevées. `npm run
 dist:win` est prévu pour créer un installateur Windows après préparation du
bundle, sans garantie de fonctionnement à ce stade. Les dépendances doivent
être installées et le build testé sur Windows avant livraison.

## À faire avant toute livraison

1. Mettre en place Supabase entièrement local, appliquer et vérifier les 58
   migrations, configurer Auth et le premier compte, Storage et Realtime.
2. Construire wacrm sous Windows avec les valeurs locales, fournir un script de
   préparation du bundle et valider tous les parcours CRM utiles.
3. Prévoir l'installation, le démarrage/arrêt et la sauvegarde des données
   locales, ainsi que la protection des clés. Éviter toute réinitialisation
   destructive lors des mises à jour.
4. Valider un installateur `.exe` sur Windows, puis traiter Meta et le webhook.

## Vérifications GitHub Actions

Le workflow `.github/workflows/desktop-ci.yml` récupère la révision wacrm
`6dbeb5b` sans modifier la version locale. Il tente de rejouer les migrations
sur Linux avec Supabase, et de construire le prototype sous Windows. La clé
utilisée pour la compilation Windows est une fausse clé de test : **le fichier
produit par cette vérification ne constitue pas une application fonctionnelle**
et n'est pas publié. Les tests ne remplacent pas une validation interactive
Windows ni l'installation des services Supabase locaux.
