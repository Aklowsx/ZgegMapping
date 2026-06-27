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
- Pillow : traitement optionnel de suppression du fond par couleur

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
6. Si le fond de l'image doit etre masque, activer `Supprimer le fond par couleur`, choisir la couleur et la tolerance, puis cliquer sur `Appliquer`.
7. Cliquer sur le point correspondant sur le fond de carte.
8. Repeter avec au moins 3 points. Utiliser 6 a 10 points pour une carte ancienne, scannee ou deformee.
9. Cliquer sur `Georeferencer la carte`.
10. Cliquer sur `Apercu rapide` pour afficher la carte georeferencee sans generer les tuiles.
11. Choisir `Points CSV` dans le menu d'import, puis cliquer sur `Importer` pour ouvrir des points sur le fond de carte et afficher le CSV dans la zone gauche.
12. Activer, masquer, renommer, ordonner et regler l'opacite des couches dans le panneau lateral.
13. Faire clic droit sur un point CSV pour lire ses informations et choisir s'il doit apparaitre dans l'export PDF.
14. Dans la zone CSV, redimensionner le tableau et les options avec la poignee horizontale, et utiliser `Inclure tous les points a l'export` pour cocher ou decocher tout le CSV.
15. Ajouter si besoin des commentaires sur les points de controle dans le panneau lateral.
16. Utiliser `Ctrl+Z` ou `Cmd+Z` sur macOS pour annuler le point en cours ou le dernier point pose.
17. Activer `Zone PDF` et glisser sur la carte pour definir la zone a exporter.
18. Cliquer sur `Exporter PDF` pour ouvrir une preview globale, puis sauvegarder un PDF haute resolution contenant uniquement la zone selectionnee et les points CSV exportables. Le rendu PDF vise un niveau de detail de fond de carte proche du zoom rue, et les points CSV exportables sont cliquables vers Google Maps.
19. Sauvegarder le projet.

L'application ne devine jamais de coordonnees : les points cible viennent uniquement des clics ou des valeurs saisies par l'utilisateur.

Les actions longues affichent une barre de suivi dans la barre de statut.

Le bouton `Jour` / `Nuit` permet de basculer entre le theme clair et le theme sombre.

Le selecteur `Fond` propose CARTO Voyager, CARTO Clair, un fond sombre avec rues jaunes et OpenStreetMap. Le choix et l'opacite du fond sont conserves localement et appliques aussi a l'export PDF.

Pour les actions longues pilotees par GDAL, comme l'import, le georeferencement, l'apercu rapide, la generation des tuiles et l'export PDF, l'application affiche le temps ecoule plutot qu'une estimation fragile du temps restant.

Les CSV de points acceptent des colonnes `lat/lng`, `x/y`, `easting/northing`, `geo_point_2d`, `geometry`, `xOuvrage/yOuvrage` ou `xouvl2e/youvl2e`. Une colonne optionnelle `epsg`, `projection`, `srid`, `srs` ou `crs` peut forcer la projection. Les exports BRGM avec `lambertOuvrage = 5` sont interpretes en Lambert II etendu `EPSG:27572`, et la projection reste modifiable dans les options CSV.

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

- `backend/check_dependencies.py` : verifie GDAL, gdalinfo, gdal2tiles, Poppler et Pillow.
- `backend/convert_pdf.py` : convertit la premiere page d'un PDF en PNG avec `pdftoppm`.
- `backend/remove_background.py` : rend transparents les pixels proches d'une couleur cible et produit un PNG RGBA.
- `backend/georeference.py` : cree des GCP avec `gdal_translate`, puis produit un GeoTIFF en `EPSG:3857` avec `gdalwarp` en conservant l'alpha.
- `backend/generate_overlay.py` : cree une image PNG georeferencee unique pour l'affichage rapide avec `L.imageOverlay`, sans supprimer la transparence.
- `backend/generate_tiles.py` : genere des tuiles XYZ avec `gdal2tiles --xyz`.

Tous les scripts retournent un JSON sur stdout et ecrivent les logs dans `projects/<nom_projet>/logs/`.
