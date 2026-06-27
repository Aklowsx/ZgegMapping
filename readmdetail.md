# ZgegMapping - Fonctionnement detaille

Ce document explique le fonctionnement du projet a deux niveaux :

- le niveau fonctionnel : ce que l'application permet de faire pour l'utilisateur ;
- le niveau technique : comment les vues React, Electron, les scripts Python et GDAL travaillent ensemble.

## 1. Objectif du projet

ZgegMapping est une application desktop locale qui permet de georeferencer des cartes scannees ou anciennes et de les afficher en surcouche sur un fond OpenStreetMap.

Le cas d'usage principal est le suivant :

1. importer une carte image ou PDF ;
2. selectionner des points identifiables sur l'image source ;
3. associer ces points a leurs positions reelles sur OpenStreetMap ;
4. produire un fichier GeoTIFF georeference avec GDAL ;
5. generer des tuiles locales XYZ compatibles Leaflet ;
6. afficher, organiser et ajuster ces tuiles comme couches superposees.

L'application ne devine pas automatiquement les coordonnees. Les correspondances entre l'image et la carte viennent uniquement des clics ou des valeurs saisies par l'utilisateur.

## 2. Fonctionnalites utilisateur

### 2.1 Gestion de projet

Un projet contient :

- un nom ;
- une date de creation ;
- une date de derniere modification ;
- une liste de couches de cartes ;
- les chemins vers les fichiers importes, convertis, georeferences et tuiles ;
- les points de controle associes a chaque couche.

Au demarrage, l'application cree en memoire un projet vide appele `Mon projet`.

L'utilisateur peut :

- renommer le projet depuis la barre d'outils ;
- sauvegarder le projet ;
- ouvrir un projet existant depuis un fichier `project.json`.

La sauvegarde ecrit le projet dans :

```text
projects/<nom_projet>/project.json
```

La sauvegarde ne produit pas une image finale. Elle enregistre l'etat du projet : couches, points, opacite, visibilite et chemins des fichiers generes.

### 2.2 Import de carte

Le bouton `Importer une carte` ouvre une boite de dialogue native Electron.

Formats acceptes :

- `jpg`
- `jpeg`
- `png`
- `tif`
- `tiff`
- `pdf`

Pour une image, le fichier est copie dans :

```text
projects/<nom_projet>/originals/
```

Pour un PDF, le fichier original est aussi copie dans `originals/`, puis la premiere page est convertie en PNG dans :

```text
projects/<nom_projet>/converted/
```

La conversion PDF utilise Poppler via la commande `pdftoppm`.

Apres import, une nouvelle couche est ajoutee au projet avec :

- un identifiant unique ;
- un nom derive du fichier source ;
- un chemin vers le fichier original ;
- eventuellement un chemin vers le PNG converti ;
- une opacite par defaut de `0.65` ;
- une visibilite activee ;
- une liste vide de points de controle.

### 2.3 Vue image source

La partie gauche de l'interface affiche l'image source de la couche selectionnee.

Elle permet :

- de zoomer et de dezoomer avec la molette ou les boutons ;
- de deplacer l'image avec un clic gauche maintenu ;
- de revenir a la taille reelle ;
- de choisir la carte active avec un menu deroulant quand plusieurs cartes sont importees ;
- de placer un point source en cliquant sur l'image ;
- de voir les marqueurs des points deja crees ;
- de voir le point temporaire en cours de creation.

Un clic court place un point source. Un clic maintenu avec deplacement sert uniquement a naviguer dans l'image et ne cree pas de point.

Quand l'utilisateur clique sur l'image, l'application calcule la position du clic dans les coordonnees pixel de l'image originale :

```text
x = position horizontale en pixels
y = position verticale en pixels
```

Ces coordonnees sont stockees dans le brouillon du point tant que le point cible n'a pas encore ete place sur la carte.

### 2.4 Vue carte OpenStreetMap

La partie centrale de l'interface affiche une carte Leaflet initialisee sur Paris :

```text
lat = 48.8566
lng = 2.3522
zoom = 13
```

Le fond de carte utilise les tuiles publiques OpenStreetMap :

```text
https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
```

La vue carte permet :

- de zoomer avec la molette ;
- de deplacer le fond avec un clic gauche maintenu ;
- de cliquer pour placer le point cible ;
- d'afficher les marqueurs des points de controle ;
- d'afficher les couches georeferencees sous forme de tuiles locales ;
- de respecter l'ordre, l'opacite et la visibilite des couches ;
- de recentrer la carte sur les points d'une couche.

Quand l'utilisateur clique sur la carte, Leaflet fournit une latitude et une longitude. L'application arrondit ces valeurs a 7 decimales avant de les stocker.

Les zones de travail sont redimensionnables. L'utilisateur peut maintenir le clic sur les separateurs verticaux entre l'image source, la carte et le panneau lateral, puis glisser pour modifier leur largeur.

### 2.5 Creation des points de controle

Un point de controle associe deux positions :

- un point source en pixels sur l'image importee ;
- un point cible en latitude/longitude sur OpenStreetMap.

Structure d'un point :

```ts
{
  id: string;
  name: string;
  sourcePixel: {
    x: number;
    y: number;
  };
  targetLatLng: {
    lat: number;
    lng: number;
  };
}
```

L'ordre des clics peut etre :

1. clic sur l'image source puis clic sur la carte ;
2. clic sur la carte puis clic sur l'image source.

Des qu'un point source et un point cible existent dans le brouillon, l'application cree un point complet dans la couche selectionnee.

Il faut au moins 3 points de controle valides pour lancer un georeferencement affine.

Pour les cartes anciennes, scannees ou deformees, l'interface recommande plutot 6 a 10 points.

L'utilisateur peut utiliser `Ctrl+Z` ou `Cmd+Z` sur macOS pour annuler :

- le point en cours s'il n'est pas encore complet ;
- sinon le dernier point ajoute sur la couche selectionnee.

Ce raccourci est ignore quand le focus est dans un champ de saisie, afin de conserver le comportement d'annulation du texte.

### 2.6 Panneau des couches

Le panneau lateral liste toutes les couches importees.

Pour chaque couche, l'utilisateur peut :

- selectionner la couche ;
- la renommer ;
- l'afficher ou la masquer ;
- la monter ou la descendre dans l'ordre d'affichage ;
- centrer la carte sur ses points de controle ;
- la supprimer ;
- modifier son opacite.

Le panneau affiche aussi des informations rapides :

- nombre de points ;
- presence ou absence d'un GeoTIFF ;
- presence ou absence de tuiles.

L'ordre des couches dans le tableau React determine aussi leur `zIndex` dans Leaflet. Les couches plus basses ou plus hautes peuvent donc apparaitre au-dessus ou au-dessous selon leur position.

### 2.7 Panneau des points de controle

Le panneau des points affiche les points de la couche selectionnee.

Il permet de :

- consulter les coordonnees pixel source ;
- consulter les coordonnees latitude/longitude cible ;
- modifier les valeurs ;
- supprimer un point.

Les modifications mettent a jour directement l'etat React du projet.

### 2.8 Georeferencement

Le bouton `Georeferencer la carte` lance la creation d'un GeoTIFF.

Conditions necessaires :

- une couche doit etre selectionnee ;
- elle doit contenir au moins 3 points de controle.

Etapes :

1. Electron cree ou verifie les dossiers du projet.
2. Les points de controle sont ecrits dans :

```text
projects/<nom_projet>/control_points/<layer-id>.json
```

3. Electron lance le script Python `backend/georeference.py`.
4. Le script verifie la presence de `gdal_translate` et `gdalwarp`.
5. Le script transforme les points React en GCP GDAL.
6. `gdal_translate` cree un fichier intermediaire avec les GCP.
7. `gdalwarp` reprojette ce fichier en `EPSG:3857`.
8. Le GeoTIFF final est ecrit dans :

```text
projects/<nom_projet>/georeferenced/<layer-id>.tif
```

Si l'operation reussit, le chemin du GeoTIFF est stocke dans la couche :

```ts
georefFilePath: string
```

### 2.9 Generation des tuiles

Le bouton `Generer les tuiles` transforme un GeoTIFF en tuiles locales.

Conditions necessaires :

- une couche doit etre selectionnee ;
- cette couche doit deja avoir un `georefFilePath`.

Etapes :

1. Electron verifie la presence du GeoTIFF dans la couche.
2. Electron lance le script Python `backend/generate_tiles.py`.
3. Le script verifie la presence de `gdal2tiles` ou `gdal2tiles.py`.
4. Le script execute `gdal2tiles --xyz`.
5. Les tuiles sont ecrites dans :

```text
projects/<nom_projet>/tiles/<layer-id>/
```

Structure produite :

```text
tiles/<layer-id>/<z>/<x>/<y>.png
```

Le zoom utilise par defaut est :

```text
0-22
```

Quand la generation reussit, la couche recoit :

```ts
tilesPath: string;
tileUrlTemplate: string;
visible: true;
```

Le `tileUrlTemplate` est une URL locale compatible Leaflet :

```text
file:///.../tiles/<layer-id>/{z}/{x}/{y}.png
```

Leaflet peut alors afficher la carte georeferencee comme une surcouche.

### 2.10 Verification des dependances

Le bouton avec l'icone de reglages lance `backend/check_dependencies.py`.

Ce script verifie la presence des outils suivants dans le `PATH` :

- `gdal_translate`
- `gdalwarp`
- `gdal2tiles` ou `gdal2tiles.py`
- `pdftoppm`

L'application affiche ensuite la liste des dependances manquantes ou confirme que tout est disponible.

### 2.11 Preview et export PDF detaille

Le bouton `Zone PDF` active un mode de selection sur la carte.

Quand ce mode est actif :

- le clic sur la carte ne cree plus de point cible ;
- l'utilisateur peut glisser sur la carte pour dessiner un rectangle d'export ;
- l'application memorise l'emprise latitude/longitude de ce rectangle ;
- l'application memorise aussi la zone exacte a capturer dans la fenetre Electron.

Le bouton `Exporter PDF` genere un rendu haute resolution de la zone selectionnee, puis ouvre une preview du PDF detaille.

Si aucune zone n'a ete selectionnee, l'application demande d'abord de definir une zone PDF.

Le PDF contient :

- une image haute resolution de la zone selectionnee ;
- le nom du projet ;
- la date de generation ;
- la couche active ;
- le nombre de couches visibles ;
- l'emprise geographique ;
- le tableau des couches ;
- le tableau des points de controle ;
- les informations du projet.

La preview s'ouvre dans une fenetre Electron separee. L'utilisateur choisit ensuite le chemin final du PDF avec une boite de dialogue native.

Le chemin propose par defaut est :

```text
projects/<nom_projet>/exports/<nom_projet>-export-<date>.pdf
```

### 2.12 Barre de suivi

Les actions longues affichent une barre de suivi dans la barre de statut :

- import ;
- sauvegarde ;
- ouverture ;
- georeferencement ;
- generation des tuiles ;
- export PDF ;
- verification des dependances.

La barre affiche un pourcentage et un temps restant estime.

Les scripts GDAL actuels ne transmettent pas encore de progression precise en temps reel. L'estimation est donc calculee par l'interface a partir d'une duree indicative par type d'action.

### 2.13 Mode jour et mode nuit

L'interface propose un bouton `Jour` / `Nuit` dans la barre d'outils.

Le mode choisi modifie les couleurs de l'application :

- fond general ;
- barre d'outils ;
- panneaux ;
- boutons ;
- champs ;
- listes ;
- barre de statut ;
- barre de progression.

Le choix est conserve dans `localStorage` sous la cle `zgeg-theme`.

## 3. Fonctionnement technique global

### 3.1 Stack

Le projet utilise :

- Electron pour l'application desktop ;
- Vite pour le serveur de developpement et le build frontend ;
- React pour l'interface ;
- TypeScript pour le frontend et le main process Electron ;
- Leaflet pour la carte interactive ;
- Python pour appeler les outils geospatiaux ;
- GDAL pour le georeferencement et la generation de tuiles ;
- Poppler pour convertir les PDF.

### 3.2 Separation des responsabilites

Le projet est separe en trois zones principales.

Frontend React :

```text
src/
```

Responsabilites :

- afficher l'interface ;
- gerer l'etat du projet ;
- collecter les clics utilisateur ;
- afficher les points de controle ;
- afficher les couches Leaflet ;
- appeler les methodes IPC exposees par Electron.

Electron :

```text
electron/
```

Responsabilites :

- creer la fenetre desktop ;
- ouvrir les boites de dialogue natives ;
- copier les fichiers importes ;
- creer les dossiers de projet ;
- lire et ecrire `project.json` ;
- lancer les scripts Python ;
- retourner les resultats au frontend.

Backend Python :

```text
backend/
```

Responsabilites :

- verifier les dependances systeme ;
- convertir les PDF ;
- appeler GDAL ;
- produire les GeoTIFF ;
- produire les tuiles ;
- ecrire les logs techniques.

### 3.3 Communication React vers Electron

Le frontend n'accede pas directement au systeme de fichiers.

Electron expose une API securisee via `contextBridge` dans `electron/preload.ts` :

```ts
window.zgegMapping.importMap(projectName)
window.zgegMapping.saveProject(project)
window.zgegMapping.openProject()
window.zgegMapping.georeferenceLayer(payload)
window.zgegMapping.generateTiles(payload)
window.zgegMapping.checkDependencies()
```

Cote React, cette API est consommee par :

```text
src/utils/ipcClient.ts
```

Chaque methode retourne une promesse avec une structure commune :

```ts
{
  success: boolean;
  message: string;
  ...
}
```

Cette structure permet a l'interface d'afficher un message dans la barre de statut.

### 3.4 Canaux IPC Electron

Les handlers IPC principaux sont definis dans `electron/main.ts`.

Canaux disponibles :

```text
project:import-map
project:save
project:open
layer:georeference
layer:generate-tiles
tools:check-dependencies
```

Chaque canal correspond a une action utilisateur de la barre d'outils.

### 3.5 Lancement des scripts Python

Electron lance les scripts avec `execFile`.

La commande Python utilisee depend de la plateforme :

- Windows : `python`
- autres plateformes : `python3`

Les scripts Python ecrivent un JSON sur `stdout`.

Electron lit ce JSON, le parse et le renvoie au frontend. Si le script echoue ou ne renvoie pas de JSON lisible, Electron retourne un message d'erreur.

### 3.6 Logs

Les logs des operations techniques sont ecrits dans :

```text
projects/<nom_projet>/logs/
```

Exemples :

```text
convert_pdf.log
georeference-gdal_translate.log
georeference-gdalwarp.log
generate_tiles.log
georeference-error.log
```

Ces logs contiennent les commandes executees ainsi que `STDOUT` et `STDERR`.

Ils sont utiles pour diagnostiquer :

- une dependance absente ;
- un fichier non lisible ;
- une erreur GDAL ;
- une erreur de conversion PDF ;
- un probleme de generation des tuiles.

## 4. Structure des donnees

### 4.1 Structure TypeScript

Les types principaux sont definis dans :

```text
src/types/project.ts
```

Un projet :

```ts
export type MapProject = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  layers: MapLayer[];
};
```

Une couche :

```ts
export type MapLayer = {
  id: string;
  name: string;
  originalFilePath: string;
  convertedImagePath?: string;
  georefFilePath?: string;
  tilesPath?: string;
  tileUrlTemplate?: string;
  opacity: number;
  visible: boolean;
  controlPoints: ControlPoint[];
};
```

Un point de controle :

```ts
export type ControlPoint = {
  id: string;
  name: string;
  sourcePixel: {
    x: number;
    y: number;
  };
  targetLatLng: {
    lat: number;
    lng: number;
  };
};
```

### 4.2 Structure disque

Chaque projet suit cette structure :

```text
projects/<nom_projet>/
+-- originals/
+-- converted/
+-- georeferenced/
+-- tiles/
+-- logs/
+-- control_points/
+-- exports/
`-- project.json
```

Role des dossiers :

- `originals/` : fichiers importes par l'utilisateur ;
- `converted/` : PNG generes depuis les PDF ;
- `georeferenced/` : GeoTIFF produits par GDAL ;
- `tiles/` : tuiles XYZ produites par `gdal2tiles` ;
- `logs/` : traces des commandes Python/GDAL ;
- `control_points/` : points de controle exportes en JSON avant georeferencement ;
- `exports/` : emplacement propose par defaut pour les PDF exportes ;
- `project.json` : etat sauvegarde du projet.

## 5. Flux complets

### 5.1 Flux d'import image

1. L'utilisateur clique sur `Importer une carte`.
2. React appelle `ipcClient.importMap(project.name)`.
3. Electron ouvre une boite de dialogue.
4. L'utilisateur choisit une image.
5. Electron copie l'image dans `originals/`.
6. Electron renvoie une nouvelle couche.
7. React ajoute la couche au projet et la selectionne.

### 5.2 Flux d'import PDF

1. L'utilisateur clique sur `Importer une carte`.
2. Electron copie le PDF dans `originals/`.
3. Electron appelle `backend/convert_pdf.py`.
4. Le script utilise `pdftoppm`.
5. La premiere page est convertie en PNG a 200 DPI.
6. Le PNG est stocke dans `converted/`.
7. React affiche le PNG converti comme image source.

### 5.3 Flux de creation d'un point

1. L'utilisateur clique sur l'image source.
2. React calcule les coordonnees pixel.
3. Le point source est stocke dans un brouillon.
4. L'utilisateur clique sur OpenStreetMap.
5. React recupere la latitude/longitude.
6. Le point cible complete le brouillon.
7. React cree un `ControlPoint`.
8. Le point est ajoute a la couche selectionnee.

Le flux inverse fonctionne aussi : carte d'abord, image ensuite.

### 5.4 Flux de georeferencement

1. L'utilisateur selectionne une couche.
2. La couche doit contenir au moins 3 points.
3. React appelle `ipcClient.georeferenceLayer`.
4. Electron ecrit les points dans `control_points/<layer-id>.json`.
5. Electron lance `backend/georeference.py`.
6. Python valide les points.
7. Python lance `gdal_translate`.
8. Python lance `gdalwarp`.
9. Python renvoie le chemin du GeoTIFF.
10. React stocke ce chemin dans `georefFilePath`.

### 5.5 Flux de generation des tuiles

1. L'utilisateur selectionne une couche georeferencee.
2. React appelle `ipcClient.generateTiles`.
3. Electron lance `backend/generate_tiles.py`.
4. Python lance `gdal2tiles --xyz`.
5. Les tuiles sont ecrites dans `tiles/<layer-id>/`.
6. Python renvoie un `tileUrlTemplate`.
7. React stocke ce template dans la couche.
8. `MapView` cree ou met a jour une `L.TileLayer`.
9. Leaflet affiche la surcouche locale.

### 5.6 Flux d'export PDF

1. L'utilisateur active `Zone PDF`.
2. L'utilisateur glisse sur la carte pour dessiner le rectangle.
3. `MapView` calcule les bornes latitude/longitude du rectangle.
4. `MapView` calcule aussi le rectangle de capture dans la fenetre Electron.
5. L'utilisateur clique sur `Exporter PDF`.
6. React envoie le projet, la couche selectionnee et la zone d'export a Electron.
7. Electron ouvre une fenetre Leaflet cachee plus grande que la zone visible.
8. Electron rend OpenStreetMap et les couches visibles dans cette fenetre haute resolution.
9. Electron capture ce rendu haute resolution avec `webContents.capturePage`.
10. Electron genere une page HTML de rapport detaille.
11. Electron ouvre cette page dans une fenetre de preview.
12. Electron ouvre une boite de dialogue de sauvegarde.
13. Electron imprime la preview avec `webContents.printToPDF`.
14. Le PDF est ecrit au chemin choisi par l'utilisateur.

## 6. Export actuel

Le projet propose maintenant une preview et un export PDF detaille de la zone selectionnee sur la carte.

Les sorties actuelles sont :

1. le GeoTIFF georeference :

```text
projects/<nom_projet>/georeferenced/<layer-id>.tif
```

2. les tuiles locales :

```text
projects/<nom_projet>/tiles/<layer-id>/<z>/<x>/<y>.png
```

3. le fichier de projet :

```text
projects/<nom_projet>/project.json
```

4. le PDF detaille :

```text
projects/<nom_projet>/exports/<nom_projet>-export-<date>.pdf
```

Le GeoTIFF peut etre reutilise dans un SIG comme QGIS.

Les tuiles peuvent etre reutilisees dans une application web Leaflet si le dossier est servi correctement.

Le PDF sert de document de consultation et de partage. Il inclut un rendu haute resolution de la zone selectionnee et des informations de projet, mais ce n'est pas un format SIG georeference.

## 7. Limitations actuelles

### 7.1 Dependances systeme

L'application depend d'outils installes sur la machine :

- GDAL pour `gdal_translate`, `gdalwarp` et `gdal2tiles` ;
- Poppler pour `pdftoppm` ;
- Python 3.

Si ces outils sont absents du `PATH`, certaines fonctions echouent.

### 7.2 PDF

Seule la premiere page d'un PDF est convertie.

La resolution de conversion est fixee a 200 DPI.

### 7.3 Georeferencement

Le georeferencement actuel repose sur les GCP fournis par l'utilisateur.

Le script produit un GeoTIFF en `EPSG:3857`, adapte a l'affichage sur des fonds web comme OpenStreetMap.

Il n'y a pas encore d'interface avancee pour choisir :

- le systeme de projection ;
- la methode de transformation ;
- le type de reechantillonnage ;
- la plage de zoom des tuiles.

### 7.4 Export final

L'export PDF detaille existe, mais il n'y a pas encore :

- d'export PNG/JPEG de la composition visible ;
- d'export MBTiles ;
- d'export d'un paquet autonome ;
- d'export vers un serveur de tuiles ;
- de configuration d'un fond local a la place d'OpenStreetMap.

## 8. Commandes de developpement

Installer les dependances :

```bash
npm install
```

Lancer en developpement :

```bash
npm run dev
```

Verifier TypeScript :

```bash
npm run check
```

Construire l'application :

```bash
npm run build
```

Lancer la version construite :

```bash
npm start
```

## 9. Fichiers importants

Interface principale :

```text
src/App.tsx
```

Vue image source :

```text
src/components/SourceImageView.tsx
```

Vue carte Leaflet :

```text
src/components/MapView.tsx
```

Panneau des couches :

```text
src/components/LayerPanel.tsx
```

Panneau des points :

```text
src/components/ControlPointPanel.tsx
```

Types du projet :

```text
src/types/project.ts
```

Client IPC frontend :

```text
src/utils/ipcClient.ts
```

Main process Electron :

```text
electron/main.ts
```

API exposee au frontend :

```text
electron/preload.ts
```

Scripts backend :

```text
backend/check_dependencies.py
backend/convert_pdf.py
backend/georeference.py
backend/generate_tiles.py
```

## 10. Resume mental du projet

ZgegMapping est un atelier local de georeferencement.

React gere l'interface, les clics, les couches et l'etat du projet.

Electron donne acces au disque, aux boites de dialogue et aux scripts Python.

Python appelle GDAL et Poppler.

GDAL transforme une image scannee en GeoTIFF puis en tuiles web.

Leaflet affiche OpenStreetMap et les tuiles locales generees.

Le coeur du projet est donc le passage :

```text
image/PDF importe
-> points de controle utilisateur
-> GeoTIFF EPSG:3857
-> tuiles XYZ locales
-> surcouche Leaflet sur OpenStreetMap
```
