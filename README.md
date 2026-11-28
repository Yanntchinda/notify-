# Transit — application de cotation Ro-Ro

Application web mobile-first permettant à un client de demander une cotation pour :

- le transport Ro-Ro de son véhicule, depuis sa ville jusqu'au pays de destination ;
- un service complémentaire (dédouanement, transport routier, assurance cargo, groupage).

Aucun compte n'est obligatoire : le visiteur peut envoyer une demande dans chaque onglet. Le compte client sert uniquement à conserver ses références et à suivre ses demandes. L'espace administrateur permet de piloter les départs, les ports, le slider, les services, les cotations et les utilisateurs.

---

## Démarrage rapide

Prérequis : **Node.js 20 ou plus**.

```bash
npm install
npm start
```

L'application est disponible sur `http://localhost:3000`.

La base de démonstration est créée automatiquement au premier démarrage (`data/db.json`). Pour la réinitialiser :

```bash
npm run seed
```

> `npm run seed` modifie le fichier de base. Si le serveur tourne déjà, redémarrez-le pour qu'il recharge la base en mémoire.

### Comptes de démonstration

| Rôle | Identifiant | Mot de passe |
|---|---|---|
| Administrateur | `admin@transit.app` | `admin123` |
| Client | `client@transit.app` | `client123` |

La page de connexion propose aussi des boutons « Admin » et « Client » pour entrer en un clic.

---

## Fonctionnalités

### Parcours visiteur

- **Page de connexion** avec choix « Se connecter / Créer un compte / Mot de passe oublié » et bouton **Continuer en visiteur**.
- **Accueil** : slider de 5 images (défilement automatique toutes les 5 s, pause au survol/toucher, flèches, indicateurs), prochains départs Ro-Ro en tête, **couloir maritime** pays de départ / pays d'arrivée (distance de route, durée de traversée, ports actifs, prochain départ) et services.
- **Ro-Ro** : choix d'un départ ou d'un trajet, bouton **Me localiser**, recherche manuelle d'adresse, itinéraire routier et distance en km jusqu'au port (tracé « votre ville → port », sans carte), formulaire véhicule et coordonnées.
- **Autres services** : 4 services avec page de cotation dédiée.
- **Confirmation** : numéro de demande généré (`RR-2026-0001`, `CT-2026-0001`, `SV-2026-0001`), récapitulatif, copie du numéro, lien WhatsApp de confirmation.
- **Compte client** : historique des demandes et statuts, références véhicules réutilisables, profil, mot de passe, langue. Les demandes envoyées en visiteur avec le même e-mail ou téléphone sont rattachées automatiquement à la création du compte.

### Espace administrateur

- **Tableau de bord** : demandes totales, à traiter, départs à venir, clients, demandes récentes.
- **Cotations** : filtres par onglet, statut, recherche (numéro, nom, e-mail, téléphone) et dates ; détail complet ; réponse avec prix et message ; changement de statut.
- **Départs Ro-Ro** : création, modification, suppression, statuts ouvert / complet / parti.
- **Ports** : nom, pays, rôle (chargement / déchargement / les deux), coordonnées GPS exactes.
- **Slider** : ajouter, remplacer, réordonner, supprimer (contrainte de 5 à 6 images).
- **Services** : gestion des services complémentaires.
- **Utilisateurs** : consultation, activation/désactivation, changement de rôle, suppression des comptes clients.
- **Notifications** : alerte à chaque nouvelle demande, marquage comme lu, ouverture directe de la demande.

---

## Stack technique

| Domaine | Choix |
|---|---|
| Backend | Node.js + Express 5 |
| Persistance | **Supabase (PostgreSQL)** — base, authentification et stockage managés, sans serveur. En local, un fichier JSON (`data/db.json`) reste disponible pour le développement. |
| Authentification | Supabase Auth (sessions JWT, mots de passe hachés par le service) |
| Frontend | HTML/CSS/JavaScript vanilla, SPA par hash routing |
| Trajet | Couloirs maritimes dessinés en SVG à partir des coordonnées GPS des ports — aucune carte, aucune tuile, aucun fond de plan à charger |
| Géocodage | Nominatim (OpenStreetMap) |
| Itinéraire | OSRM Public Demo Server (`router.project-osrm.org`) |
| E-mails | Nodemailer (facultatif, via SMTP) |
| PWA | Manifest + service worker (installation possible) |

### Pourquoi plus aucune carte ?

L'application n'affiche **aucune carte**. Les fonds de plan (tuiles OpenStreetMap, CARTO, Esri…) étaient bloqués sur le réseau de plusieurs utilisateurs — erreurs 403, iframes d'aperçu, connexions mobiles filtrées — et ils font appel à des serveurs extérieurs à chaque affichage. À la place, tout est **calculé à partir des coordonnées GPS des ports** :

- **Accueil — couloir maritime** : le pays de départ et le pays d'arrivée choisis, l'application dessine le trajet en SVG (port A, arc animé, port B) et affiche la distance de route estimée, la durée de traversée à 15 nœuds, le nombre de ports actifs, le nombre de départs ouverts et la date du prochain départ.
- **Formulaires — tracé « votre ville → port »** : même principe, en une ligne, avec les kilomètres entre la position du client et le port de chargement.
- **Aucune dépendance extérieure** : ni Leaflet, ni tuiles, ni clé API. Le tracé fonctionne hors ligne, sur tous les réseaux, et pèse quelques kilo-octets dans l'APK.

Seuls les services de **distance** restent externes, et ils sont facultatifs : Nominatim pour trouver une adresse, OSRM pour l'itinéraire routier. Au premier échec, l'application bascule sur le répertoire de villes embarqué et la distance à vol d'oiseau — le formulaire reste utilisable de bout en bout.

### Recherche de ville et distance sans réseau

Quand Nominatim ou OSRM ne répondent pas (réseau bloqué, connexion lente), l'application bascule sur un **répertoire local** de 4 100 villes (`public/data/gazetteer.json`, 219 Ko, données GeoNames) enrichi de 47 villes supplémentaires (`public/data/cities.json`) : « Douala », « Yaoundé », « Anvers, Belgique » sont reconnus en français. La distance est alors calculée **à vol d'oiseau** et signalée comme telle (« Itinéraire détaillé indisponible : distance estimée à vol d'oiseau »). Dès que le réseau revient, l'itinéraire routier détaillé et le temps de trajet remplacent l'estimation.

### Géolocalisation bloquée

Certains navigateurs intègrent l'application dans un cadre qui interdit la géolocalisation. L'application détecte ce cas **avant** de demander la permission : au lieu d'un refus, elle affiche « Saisissez votre ville » et place le curseur dans le champ de recherche. La distance se calcule ensuite exactement de la même façon.

---

## Configuration

Copier `.env.example` vers `.env` puis adapter :

| Variable | Rôle |
|---|---|
| `PORT` | Port d'écoute (3000 par défaut) |
| `APP_URL` | URL publique, utilisée dans les liens de réinitialisation |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | Envoi d'e-mails (facultatif) |
| `SMTP_FROM` | Expéditeur des e-mails |
| `ADMIN_EMAIL` | Alerte e-mail à chaque nouvelle demande (facultatif) |

Sans configuration SMTP, les e-mails sont simulés : les confirmations restent visibles dans l'application et les notifications administrateur, et le lien de réinitialisation est affiché dans la console du serveur pour la démonstration.

### Géolocalisation

L'API de géolocalisation du navigateur exige une connexion sécurisée (**HTTPS**) ou `localhost`. En cas de refus ou d'indisponibilité, la saisie manuelle de la ville/adresse prend le relais et le calcul de distance fonctionne de la même façon. Si aucun trajet routier n'est trouvé, un message invite à contacter le prestataire.

---

## Structure du projet

```
server/
  index.js        API Express (auth, cotations, admin, uploads)
  db.js           Persistance JSON, sessions, hachage des mots de passe
  seed.js         Données de démonstration
  mailer.js       E-mails sortants (Nodemailer)
public/
  index.html      Point d'entrée SPA
  css/styles.css  Design mobile-first
  js/api.js       Client HTTP
  js/ui.js        Composants, icônes, statuts, modales, toasts
  js/geo.js       Géocodage, recherche de ville, itinéraire, distance jusqu'au port
  js/app.js       Routes, pages publiques, compte client, administration
  data/           Répertoires de villes (gazetteer, cities) et contenu de démonstration
  img/            Visuels du slider, icônes PWA
  sw.js           Service worker
scripts/
  api-test.js     Test d'intégration API
  e2e-ui.js       Test de bout en bout (jsdom, GPS simulé)
  smoke-test.js   Test de chargement des pages
  backup.js       Sauvegarde horodatée de la base
  generate_icons.py  Génération des icônes PWA
data/db.json      Base de démonstration (ignorée par Git)
```

---

## Tests

Démarrer le serveur puis :

```bash
npm run test:supabase  # 24 vérifications : toute l'application sur Supabase (mock PostgREST)
npm run test:api       # 54 assertions sur l'API Node (développement)
npm run test:e2e       # parcours UI avec géocodage/itinéraire simulés
```

`test:supabase` n'a besoin d'aucun projet Supabase : un serveur local imite PostgREST et l'authentification.

Les tests créent des données de démonstration. Pour retrouver un état propre :

```bash
npm run seed
# puis redémarrer le serveur
```

---

## Choix d'implémentation et points à valider

Le cahier des charges listait plusieurs points à valider avant le développement. Les choix suivants ont été faits pour livrer un prototype complet :

| Point | Choix retenu | À confirmer |
|---|---|---|
| « Références » | Véhicules : marque, modèle, châssis (VIN), type, année. | Ajouter d'autres champs (cylindrée, couleur, numéro de plaque…) ? |
| Onglets supplémentaires | 4 services : Dédouanement & transit, Transport routier, Assurance cargo, Groupage & consolidation | Noms et contenu exacts |
| Carte | Aucune carte : couloirs maritimes en SVG + distance Nominatim/OSRM | Réintroduire une carte si un fournisseur fiable avec SLA est choisi |
| Canal de réponse | E-mail (SMTP) + WhatsApp (lien), notifications in-app | Canal prioritaire |
| Langues | Interface en français ; préférence anglais enregistrée mais interface non traduite | Traduction anglaise |
| Devises | Prix saisi librement par l'administrateur (FCFA, EUR…) | Devises et règles d'affichage |
| Paiement | Aucun paiement en ligne : simple demande de prix | — |

### Prérequis réseau

Aucun. Les tracés sont dessinés par l'application à partir des coordonnées GPS déjà stockées dans la base : aucune tuile, aucun domaine de cartographie à autoriser. Seuls la recherche d'adresse (Nominatim) et l'itinéraire routier (OSRM) sortent du navigateur, et leur échec est prévu : l'application bascule sur son répertoire de villes local et la distance à vol d'oiseau.

### Version Android (APK)

L'application est empaquetée avec **Capacitor** : l'APK ouvre l'application dans un WebView natif, plein écran, avec son icône et son écran de démarrage. La géolocalisation (« Me localiser ») est autorisée par le manifeste Android.

**Prérequis** : un projet Supabase configuré (voir « Hébergement » ci-dessus). L'APK contient l'interface complète et parle directement à Supabase — **aucun serveur, aucun domaine** n'est nécessaire pour l'application installée.

#### Construire l'APK automatiquement (GitHub Actions)

1. Ouvrir `.github/workflows/android.yml` et renseigner les trois variables (Project Settings → API pour les deux premières) :
   ```yaml
   env:
     SUPABASE_URL: https://votre-projet.supabase.co
     SUPABASE_ANON_KEY: eyJhbGciOi...
     PUBLIC_APP_URL: https://votre-site.com   # liens de réinitialisation du mot de passe
   ```
   La clé `anon` est **publique par conception** : elle ne donne que les droits définis par les politiques RLS.
2. Pousser le code : `git push`. Aller dans l'onglet **Actions** du dépôt GitHub.
3. Choisir **Android APK** → **Run workflow** (ou pousser un tag `v1.0.0`).
4. À la fin du travail, télécharger l'artefact **transit-apk** (≈ 10 Mo) :
   - `app-debug.apk` — installable immédiatement sur un téléphone (activation « sources inconnues ») ;
   - `app-release-unsigned.apk` — à signer pour une publication.

   Lien direct : onglet **Actions** → dernière exécution **Android APK** → **Artifacts** → `transit-apk`.

> ⚠️ Tant que `SUPABASE_URL` et `SUPABASE_ANON_KEY` ne sont pas renseignées, l'application installée affiche « Base de données non configurée ». Modifiez les variables, poussez, puis téléchargez le nouvel artefact.

#### Construire l'APK sur sa machine

```bash
npm ci
SUPABASE_URL=https://votre-projet.supabase.co \
SUPABASE_ANON_KEY=eyJhbGciOi... \
PUBLIC_APP_URL=https://votre-site.com npm run build:android
cd android && ./gradlew assembleDebug
```

Nécessite **JDK 17** et le **SDK Android 34** (Android Studio ou `sdkmanager`). L'APK se trouve dans `android/app/build/outputs/apk/debug/`.

#### Publier sur le Play Store

```bash
keytool -genkey -v -keystore transit.keystore -alias transit -keyalg RSA -keysize 2048 -validity 10000
cd android && ./gradlew assembleRelease
# signer avec apksigner puis téléverser le .aab/.apk sur Play Console
```

### Hébergement — plus de serveur

L'application ne contient **aucun serveur à administrer** : l'interface est statique (GitHub Pages, Netlify, n'importe quel hébergeur gratuit) et les données vivent dans **Supabase** (PostgreSQL + authentification + stockage, offre gratuite).

| Élément | Rôle | Où |
|---|---|---|
| `public/` | Interface web + application mobile | Hébergement statique gratuit (GitHub Pages) |
| Supabase | Base, authentification, fichiers, e-mails | https://supabase.com (gratuit) |
| APK / iOS | Fenêtres natives qui parlent à Supabase | GitHub Actions |

#### Mise en place (≈ 15 minutes)

1. **Créer le projet** sur https://supabase.com (offre gratuite, 500 Mo).
2. **Créer les tables** : SQL Editor → coller `supabase/schema.sql` → **Run**.
3. **Charger la démonstration** : SQL Editor → coller `supabase/seed.sql` → **Run**.
4. **Récupérer les clés** : Project Settings → API → `Project URL` et `anon public`.
5. **Configurer l'application** : renseigner `supabaseUrl`, `supabaseAnonKey` et `appUrl` dans `public/js/config.js`.
6. **Créer le compte admin** : s'inscrire dans l'application avec `admin@transit.app`, puis dans SQL Editor :
   ```sql
   update public.profiles set role = 'admin' where email = 'admin@transit.app';
   ```
7. **Désactiver la confirmation par e-mail** (comptes de démonstration) : Authentication → Providers → Email → décocher « Confirm email ». Sinon l'utilisateur doit valider son adresse avant de se connecter.

#### E-mails de notification

Une fonction Supabase prévient l'administrateur à chaque demande (le client est répondu à la main depuis votre téléphone) :

```bash
npx supabase login
npx supabase link --project-ref VOTRE-PROJET
npx supabase secrets set RESEND_API_KEY=... ADMIN_EMAIL=... APP_URL=... MAIL_FROM=...
npx supabase functions deploy notify
```

Puis **Database → Webhooks** : table `quotes`, événement *Insert*, URL `https://VOTRE-PROJET.supabase.co/functions/v1/notify`.

> Le domaine d'envoi doit être vérifié dans Resend (Domaines → Ajouter). Avec l'expéditeur de test `onboarding@resend.dev`, Resend n'envoie qu'à l'adresse de votre compte Resend.
>
> Chaque e-mail reçu contient le numéro, le type de demande, le nom, l'e-mail et le téléphone du client, plus un lien direct vers la demande. Le bouton **Répondre** de votre messagerie écrit au client (`reply_to` = son adresse).

#### Site web

Pousser le dépôt et activer **GitHub Pages** (branche `main`, dossier `/docs` ou à la racine) — ou déposer `public/` sur Netlify. Aucun backend à déployer.

### Application iPhone (iOS)

Le projet iOS est généré avec Capacitor (`ios/`) : même interface, icône et écran de démarrage dédiés.

**Trois façons d'obtenir l'application sur un iPhone :**

| Méthode | Coût | Ce qu'il faut |
|---|---|---|
| **PWA** — Safari → « Sur l'écran d'accueil » | Gratuit | L'application hébergée en HTTPS |
| **Xcode** — installation sur votre propre iPhone | Gratuit (compte Apple ID) | Un Mac + Xcode, signature valable 7 jours |
| **TestFlight / App Store** | 99 $/an | Compte Apple Developer, certificats de signature |

**Build automatique (GitHub Actions)** : le workflow `iOS` construit deux artefacts — un `.app` pour le simulateur iOS et une archive iPhone non signée :

https://github.com/Yanntchinda/notify-/actions/workflows/ios.yml

Sur un Mac, pour installer sur votre iPhone avec un compte Apple ID gratuit :
```bash
SUPABASE_URL=https://votre-projet.supabase.co SUPABASE_ANON_KEY=eyJ... npm run build:ios
npx cap open ios        # ouvre Xcode
# Dans Xcode : Signing & Capabilities → votre équipe → Brancher l'iPhone → Run
```

### Sécurité et déploiement

- **Aucun serveur applicatif** : fichiers statiques + Supabase. Le serveur Node (`npm start`) reste disponible pour le développement local et les tests, mais n'est plus nécessaire en production.
- HTTPS obligatoire (géolocalisation, cookies sécurisés).
- Mots de passe hachés par **Supabase Auth**, sessions JWT, chaque table protégée par des politiques **RLS** ; les visiteurs ne peuvent pas lire les demandes des autres (création via la fonction `submit_quote`).
- Sauvegardes : Supabase conserve un historique des sauvegardes quotidiennes sur l'offre payante ; en offre gratuite, exportez depuis **Database → Backups** ou l'éditeur SQL.
- En production : remplacer la persistance JSON par une base de données, ajouter une limitation de débit, un CSP adapté et un hébergement SMTP.
- Les serveurs publics Nominatim/OSRM conviennent à la démonstration ; prévoir un hébergement dédié ou un fournisseur pour la production.

---

## Limites connues du prototype

- Persistance JSON mono-processus (pas de montée en charge concurrente).
- Pas de traduction anglaise effective.
- Pas de paiement en ligne (conforme au cahier des charges).
- Les e-mails nécessitent une configuration SMTP ; sinon ils sont simulés.
- Les distances sont calculées côté navigateur via les services publics ; une clé/fournisseur dédié est recommandé en production.
