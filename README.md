# ZgegMapping

Application desktop locale pour importer des cartes JPEG, PNG, TIFF ou PDF, poser des points de controle, georeferencer les images avec GDAL, generer des tuiles locales, les afficher en surcouche Leaflet sur un fond OpenStreetMap et exporter une zone selectionnee en PDF.

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
2. Naviguer dans l'image source et le fond OpenStreetMap avec la molette et le clic gauche maintenu.
3. Si plusieurs cartes sont importees, choisir la carte active depuis le menu deroulant du panneau gauche.
4. Cliquer sur un point identifiable de l'image source.
5. Cliquer sur le point correspondant sur le fond OpenStreetMap.
6. Repeter avec au moins 3 points. Utiliser 6 a 10 points pour une carte ancienne, scannee ou deformee.
7. Cliquer sur `Georeferencer la carte`.
8. Cliquer sur `Generer les tuiles`.
9. Activer, masquer, renommer, ordonner et regler l'opacite des couches dans le panneau lateral.
10. Utiliser `Ctrl+Z` ou `Cmd+Z` sur macOS pour annuler le point en cours ou le dernier point pose.
11. Activer `Zone PDF` et glisser sur la carte pour definir la zone a exporter.
12. Cliquer sur `Exporter PDF` pour ouvrir une preview du PDF detaille, puis sauvegarder le PDF.
13. Sauvegarder le projet.

L'application ne devine jamais de coordonnees : les points cible viennent uniquement des clics ou des valeurs saisies par l'utilisateur.

Les actions longues affichent une barre de suivi dans la barre de statut avec un temps restant estime.

Le bouton `Jour` / `Nuit` permet de basculer entre le theme clair et le theme sombre.

## Structure des donnees

Chaque projet est sauvegarde dans :

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

Les donnees restent locales. Le fond OpenStreetMap utilise les tuiles publiques OSM tant qu'aucun fond local n'est configure.

## Scripts Python

- `backend/check_dependencies.py` : verifie GDAL, gdal2tiles et Poppler.
- `backend/convert_pdf.py` : convertit la premiere page d'un PDF en PNG avec `pdftoppm`.
- `backend/georeference.py` : cree des GCP avec `gdal_translate`, puis produit un GeoTIFF en `EPSG:3857` avec `gdalwarp`.
- `backend/generate_tiles.py` : genere des tuiles XYZ avec `gdal2tiles --xyz`.

Tous les scripts retournent un JSON sur stdout et ecrivent les logs dans `projects/<nom_projet>/logs/`.
