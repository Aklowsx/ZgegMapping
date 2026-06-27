# ZgegMapping

Application desktop locale pour importer des cartes JPEG, PNG, TIFF ou PDF, importer des CSV de points, poser des points de controle, georeferencer les images avec GDAL, afficher rapidement la carte georeferencee en surcouche Leaflet, generer des tuiles locales si besoin, et exporter une zone selectionnee en PDF.

## Stack

- Electron
- Vite
- React
- TypeScript
- Leaflet
- Python
- GDAL en ligne de commande quand disponible
- Stockage local JSON + dossiers de projet

## Installation

```bash
cd zgeg-mapping
npm install
```

Dependances systeme recommandees :

- GDAL : `gdal_translate`, `gdalwarp`, `gdal2tiles`
- Poppler : `pdftoppm` pour convertir la premiere page des PDF
- Python 3

Sur Windows, installez GDAL/Poppler et verifiez que les executables sont dans le `PATH`.

## Lancement

```bash
npm run dev
```

Build :

```bash
npm run build
npm start
```

## Workflow MVP

1. Importer une carte image ou PDF.
2. Choisir le fond de carte dans le selecteur `Fond`.
3. Naviguer dans l'image source et le fond de carte avec la molette et le clic gauche maintenu.
4. Si plusieurs cartes sont importees, choisir la carte active depuis le menu deroulant du panneau gauche.
5. Cliquer sur un point identifiable de l'image source.
6. Cliquer sur le point correspondant sur le fond de carte.
7. Repeter avec au moins 3 points. Utiliser 6 a 10 points pour une carte ancienne, scannee ou deformee.
8. Cliquer sur `Georeferencer la carte`.
9. Cliquer sur `Apercu rapide` pour afficher la carte georeferencee sans generer les tuiles.
10. Choisir `Points CSV` dans le menu d'import, puis cliquer sur `Importer` pour ouvrir des points sur le fond de carte et afficher le CSV dans la zone gauche.
11. Activer, masquer, renommer, ordonner et regler l'opacite des couches dans le panneau lateral.
12. Utiliser `Ctrl+Z` ou `Cmd+Z` sur macOS pour annuler le point en cours ou le dernier point pose.
13. Activer `Zone PDF` et glisser sur la carte pour definir la zone a exporter.
14. Cliquer sur `Exporter PDF` pour ouvrir une preview globale, puis sauvegarder un PDF haute resolution contenant uniquement la zone selectionnee.
15. Sauvegarder le projet.

L'application ne devine jamais de coordonnees : les points cible viennent uniquement des clics ou des valeurs saisies par l'utilisateur.

Les actions longues affichent une barre de suivi dans la barre de statut.

Le bouton `Jour` / `Nuit` permet de basculer entre le theme clair et le theme sombre.

Le selecteur `Fond` propose CARTO Voyager, CARTO Clair, un fond sombre avec rues jaunes et OpenStreetMap. Le choix et l'opacite du fond sont conserves localement et appliques aussi a l'export PDF.

Pour les actions longues pilotees par GDAL, comme l'import, le georeferencement, l'apercu rapide, la generation des tuiles et l'export PDF, l'application affiche le temps ecoule plutot qu'une estimation fragile du temps restant.

Les CSV de points acceptent des colonnes `lat/lng`, `x/y`, `easting/northing`, `geo_point_2d` ou `geometry`. Une colonne optionnelle `epsg`, `projection`, `srid`, `srs` ou `crs` peut forcer la projection, et la projection reste modifiable dans les options CSV.

## Structure des donnees

Chaque projet est sauvegarde dans :

```text
projects/<nom_projet>/
+-- originals/
+-- points/
+-- converted/
+-- georeferenced/
+-- overlays/
+-- tiles/
+-- logs/
+-- control_points/
+-- exports/
`-- project.json
```

Les donnees du projet restent locales. Les fonds de carte utilisent des tuiles publiques externes selon le fond selectionne.

## Scripts Python

- `backend/check_dependencies.py` : verifie GDAL, gdalinfo, gdal2tiles et Poppler.
- `backend/convert_pdf.py` : convertit la premiere page d'un PDF en PNG avec `pdftoppm`.
- `backend/georeference.py` : cree des GCP avec `gdal_translate`, puis produit un GeoTIFF en `EPSG:3857` avec `gdalwarp`.
- `backend/generate_overlay.py` : cree une image JPEG georeferencee unique pour l'affichage rapide avec `L.imageOverlay`.
- `backend/generate_tiles.py` : genere des tuiles XYZ avec `gdal2tiles --xyz`.

Tous les scripts retournent un JSON sur stdout et ecrivent les logs dans `projects/<nom_projet>/logs/`.
