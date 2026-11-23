# Transit — application de cotation Ro-Ro & conteneurs

Application web mobile-first permettant à un client de demander une cotation pour :

- le transport Ro-Ro de son véhicule, depuis sa ville jusqu'au pays de destination ;
- l'achat d'un conteneur (neuf ou d'occasion), avec livraison ;
- un service complémentaire (dédouanement, transport routier, assurance cargo, groupage).

Aucun compte n'est obligatoire : le visiteur peut envoyer une demande dans chaque onglet. Le compte client sert uniquement à conserver ses références et à suivre ses demandes. L'espace administrateur permet de piloter les départs, les ports, le slider, les conteneurs, les services, les cotations et les utilisateurs.

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
- **Accueil** : slider de 5 images (défilement automatique toutes les 5 s, pause au survol/toucher, flèches, indicateurs), prochains départs Ro-Ro en tête, carte pays de départ / pays d'arrivée, catalogue conteneurs et services.
- **Ro-Ro** : choix d'un départ ou d'un trajet, carte Leaflet, bouton **Me localiser**, recherche manuelle d'adresse, itinéraire routier et distance en km jusqu'au port, formulaire véhicule et coordonnées.
- **Conteneurs** : catalogue avec photos et caractéristiques, formulaire de prix (type, quantité, neuf/occasion, ville et pays de livraison, usage, date souhaitée), même outil carte/GPS pour la distance jusqu'au port.
- **Autres services** : 4 services avec page de cotation dédiée.
- **Confirmation** : numéro de demande généré (`RR-2026-0001`, `CT-2026-0001`, `SV-2026-0001`), récapitulatif, copie du numéro, lien WhatsApp de confirmation.
- **Compte client** : historique des demandes et statuts, références véhicules/conteneurs réutilisables, profil, mot de passe, langue. Les demandes envoyées en visiteur avec le même e-mail ou téléphone sont rattachées automatiquement à la création du compte.

### Espace administrateur

- **Tableau de bord** : demandes totales, à traiter, départs à venir, clients, demandes récentes.
- **Cotations** : filtres par onglet, statut, recherche (numéro, nom, e-mail, téléphone) et dates ; détail complet ; réponse avec prix et message ; changement de statut.
- **Départs Ro-Ro** : création, modification, suppression, statuts ouvert / complet / parti.
- **Ports** : nom, pays, rôle (chargement / déchargement / les deux), coordonnées GPS exactes.
- **Conteneurs** : types, photos (upload compressé), descriptions, dimensions, volume.
- **Slider** : ajouter, remplacer, réordonner, supprimer (contrainte de 5 à 6 images).
- **Services** : gestion des services complémentaires.
- **Utilisateurs** : consultation, activation/désactivation, changement de rôle, suppression des comptes clients.
- **Notifications** : alerte à chaque nouvelle demande, marquage comme lu, ouverture directe de la demande.

---

## Stack technique

| Domaine | Choix |
|---|---|
| Backend | Node.js + Express 5 |
| Persistance | Fichier JSON (`data/db.json`) avec écriture atomique — adapté à un prototype, à remplacer par PostgreSQL/MySQL en production |
| Authentification | Sessions par cookie HTTP-only, mots de passe hachés avec `scrypt` |
| Frontend | HTML/CSS/JavaScript vanilla, SPA par hash routing |
| Carte | Leaflet + **plan embarqué** (Natural Earth) + plan détaillé gratuit automatiquement sélectionné parmi 7 fournisseurs (OpenStreetMap, OSM France, OSM Allemagne, OpenTopoMap, CARTO Voyager, Esri World Street Map, Wikimedia) + imagerie Esri |
| Géocodage | Nominatim (OpenStreetMap) |
| Itinéraire | OSRM Public Demo Server (`router.project-osrm.org`) |
| E-mails | Nodemailer (facultatif, via SMTP) |
| PWA | Manifest + service worker (installation possible) |

### Pourquoi Leaflet / OpenStreetMap ?

Le cahier des charges proposait Google Maps Platform (payant à l'usage) ou Leaflet + OpenStreetMap + service d'itinéraire libre. Le choix libre a été retenu pour le prototype : aucune clé API, aucun coût, et les mêmes fonctionnalités (carte, marqueurs, polyline, géocodage, distance routière). En production, il est recommandé d'héberger son propre serveur OSRM ou d'utiliser un fournisseur avec SLA, car les serveurs publics de démonstration sont limités.

### Plan embarqué et plan de rues

Toutes les cartes (accueil, Ro-Ro, conteneurs, administration des ports) affichent d'abord un **plan embarqué** : les continents, les frontières des 177 pays **avec leurs noms en français**, 47 villes et leurs libellés sont servis par l'application elle-même (`public/data/`, données Natural Earth du domaine public, 163 Ko). La carte s'affiche donc **même sans accès aux serveurs de tuiles**, et instantanément.

Par-dessus, l'application cherche **le premier plan détaillé réellement joignable** parmi sept fournisseurs gratuits : OpenStreetMap, OSM France, OSM Allemagne, OpenTopoMap, CARTO Voyager, Esri World Street Map et Wikimedia Maps — plus l'imagerie satellite Esri. Chaque fournisseur est testé par **une seule tuile-sonde** ; le premier qui répond est retenu. Si un réseau bloque OpenStreetMap mais pas CARTO (ou l'inverse), la carte détaillée s'affiche quand même.

**Diagnostic intégré** : si aucun serveur ne répond, le lien « Détails » du badge ouvre la liste de tous les fournisseurs testés avec leur état (Accessible / Bloqué). C'est le rapport à transmettre à l'administrateur réseau pour faire autoriser le bon domaine.

- **Sélecteur de fond** en haut à droite de chaque carte : « Plan embarqué », « Plan de rues », « Satellite ». Le choix est mémorisé sur l'appareil et repris sur toutes les pages.
- **Aucune erreur 403** : dans un aperçu intégré (iframe) ou après un premier échec, l'application ne tente plus aucun chargement de tuiles. Avant d'activer un fond détaillé, une **sonde unique** vérifie qu'une tuile est réellement accessible ; si elle échoue, aucun autre appel n'est émis.
- **Secours automatique** : si le fournisseur ne répond pas (tuiles en erreur, réseau bloqué, timeout de 12 s), le fond bascule sur le fournisseur suivant puis sur le plan embarqué ; un badge en bas à gauche indique le plan réellement affiché.
- **Aucun fournisseur joignable** : la carte reste utilisable grâce au plan embarqué ; le badge indique « Plan simplifié · hors ligne » et un lien **Réessayer** relance le chargement (ou automatiquement au retour du réseau).

### Recherche de ville et distance sans réseau

Quand Nominatim ou OSRM ne répondent pas (réseau bloqué, connexion lente), l'application bascule sur un **répertoire local** de 4 100 villes (`public/data/gazetteer.json`, 219 Ko, données GeoNames) enrichi des villes du plan embarqué : « Douala », « Yaoundé », « Anvers, Belgique » sont reconnus en français. La distance est alors calculée **à vol d'oiseau** et signalée comme telle (« Itinéraire détaillé indisponible : distance estimée à vol d'oiseau »). Dès que le réseau revient, l'itinéraire routier détaillé et le temps de trajet remplacent l'estimation.

### Géolocalisation bloquée

Certains navigateurs intègrent l'application dans un cadre qui interdit la géolocalisation. L'application détecte ce cas **avant** de demander la permission : au lieu d'un refus, elle affiche « Saisissez votre ville » et place le curseur dans le champ de recherche. La distance se calcule ensuite exactement de la même façon.
- Aucune clé d'API : seules les attributions sont affichées en bas de carte.

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
  js/map.js       Leaflet, plan embarqué, géocodage, itinéraire, distance
  js/app.js       Routes, pages publiques, compte client, administration
  data/           Plan embarqué Natural Earth (continents, pays, villes) + répertoire de villes
  img/            Visuels du slider, conteneurs, icônes PWA
  vendor/leaflet/ Leaflet servi localement
  vendor/topojson/  Décodeur TopoJSON du plan embarqué
  sw.js           Service worker
scripts/
  api-test.js     Test d'intégration API
  e2e-ui.js       Test de bout en bout (jsdom, GPS simulé)
  smoke-test.js   Test de chargement des pages
  backup.js       Sauvegarde horodatée de la base
  build-basemap.js  Régénère public/data/ depuis world-atlas
  generate_icons.py  Génération des icônes PWA
data/db.json      Base de démonstration (ignorée par Git)
```

---

## Tests

Démarrer le serveur puis :

```bash
npm run test:api   # 53 assertions sur l'API (auth, cotations, admin, sécurité)
npm run test:e2e   # parcours UI avec géocodage/itinéraire simulés
```

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
| « Références » | Véhicules : marque, modèle, châssis (VIN), type, année. Conteneurs : type, état, notes. | Ajouter d'autres champs (cylindrée, couleur, numéro de plaque…) ? |
| Onglets supplémentaires | 4 services : Dédouanement & transit, Transport routier, Assurance cargo, Groupage & consolidation | Noms et contenu exacts |
| Carte | Leaflet + OpenStreetMap + Nominatim + OSRM (libre) | Google Maps si un SLA et un budget sont confirmés |
| Canal de réponse | E-mail (SMTP) + WhatsApp (lien), notifications in-app | Canal prioritaire |
| Langues | Interface en français ; préférence anglais enregistrée mais interface non traduite | Traduction anglaise |
| Devises | Prix saisi librement par l'administrateur (FCFA, EUR…) | Devises et règles d'affichage |
| Paiement | Aucun paiement en ligne : simple demande de prix | — |

### Prérequis réseau de la carte

Les tuiles sont chargées **par le navigateur du visiteur**, pas par le serveur : c'est donc le réseau du visiteur qui doit pouvoir joindre au moins un serveur de cartes. L'application en teste sept (OpenStreetMap, OSM France, OSM Allemagne, OpenTopoMap, CARTO, Esri, Wikimedia) et retient le premier joignable ; sinon elle affiche le plan embarqué et un diagnostic (« Détails » dans le badge).

Sur un réseau d'entreprise, un campus ou un pays qui filtre ces domaines, deux options : faire autoriser au moins un des domaines par l'administrateur, ou servir les tuiles depuis votre propre domaine (fournisseur avec clé, ou serveur de tuiles auto-hébergé) en changeant l'URL dans `STREET_PROVIDERS` (`public/js/map.js`).

### Version Android (APK)

L'application est empaquetée avec **Capacitor** : l'APK ouvre l'application dans un WebView natif, plein écran, avec son icône et son écran de démarrage. La géolocalisation (« Me localiser ») est autorisée par le manifeste Android.

**Prérequis** : l'application doit être déployée et accessible en **HTTPS** (l'APK pointe vers cette adresse). Sans serveur, l'APK affiche la coquille locale sans API.

#### Construire l'APK automatiquement (GitHub Actions)

1. Ouvrir `.github/workflows/android.yml` et remplacer `PUBLIC_APP_URL` par l'adresse de votre application :
   ```yaml
   env:
     PUBLIC_APP_URL: https://transit.votre-domaine.com
   ```
2. Pousser le code : `git push`. Aller dans l'onglet **Actions** du dépôt GitHub.
3. Choisir **Android APK** → **Run workflow** (ou pousser un tag `v1.0.0`).
4. À la fin du travail, télécharger l'artefact **transit-apk** (≈ 10 Mo) :
   - `app-debug.apk` — installable immédiatement sur un téléphone (activation « sources inconnues ») ;
   - `app-release-unsigned.apk` — à signer pour une publication.

   Lien direct : onglet **Actions** → dernière exécution **Android APK** → **Artifacts** → `transit-apk`.

> ⚠️ L'APK ouvre l'adresse `PUBLIC_APP_URL` : tant que cette variable n'est pas remplacée par votre domaine, l'application installée affiche une erreur de connexion. Modifiez la variable, poussez, puis téléchargez le nouvel artefact.

#### Construire l'APK sur sa machine

```bash
npm ci
PUBLIC_APP_URL=https://transit.votre-domaine.com npm run build:android
cd android && ./gradlew assembleDebug
```

Nécessite **JDK 17** et le **SDK Android 34** (Android Studio ou `sdkmanager`). L'APK se trouve dans `android/app/build/outputs/apk/debug/`.

#### Publier sur le Play Store

```bash
keytool -genkey -v -keystore transit.keystore -alias transit -keyalg RSA -keysize 2048 -validity 10000
cd android && ./gradlew assembleRelease
# signer avec apksigner puis téléverser le .aab/.apk sur Play Console
```

### Sécurité et déploiement

- **Aucune compilation** : Node.js + fichiers statiques. `npm ci && npm run seed && npm start` derrière un reverse proxy (Nginx/Caddy) avec HTTPS.
- HTTPS obligatoire (géolocalisation, cookies sécurisés).
- Mots de passe hachés avec `scrypt`, sessions HTTP-only, protection des routes administrateur.
- Sauvegardes régulières recommandées : `npm run backup` (ou cron) puis copie hors serveur.
- En production : remplacer la persistance JSON par une base de données, ajouter une limitation de débit, un CSP adapté et un hébergement SMTP.
- Les serveurs publics Nominatim/OSRM conviennent à la démonstration ; prévoir un hébergement dédié ou un fournisseur pour la production.

---

## Limites connues du prototype

- Persistance JSON mono-processus (pas de montée en charge concurrente).
- Pas de traduction anglaise effective.
- Pas de paiement en ligne (conforme au cahier des charges).
- Les e-mails nécessitent une configuration SMTP ; sinon ils sont simulés.
- Les distances sont calculées côté navigateur via les services publics ; une clé/fournisseur dédié est recommandé en production.
