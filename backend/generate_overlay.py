#!/usr/bin/env python3
import argparse
import json
import math
import shutil
import subprocess
from pathlib import Path


WEB_MERCATOR_LIMIT = 20037508.342789244


def emit(success: bool, message: str, **extra):
    print(json.dumps({"success": success, "message": message, **extra}))


def write_log(logs_dir: Path, content: str):
    logs_dir.mkdir(parents=True, exist_ok=True)
    (logs_dir / "generate_overlay.log").write_text(content, encoding="utf-8")


def flatten_coordinates(value):
    if not isinstance(value, list):
        return []
    if len(value) >= 2 and all(isinstance(item, (int, float)) for item in value[:2]):
        return [value[:2]]
    points = []
    for item in value:
        points.extend(flatten_coordinates(item))
    return points


def mercator_to_wgs84(x, y):
    lon = (float(x) / WEB_MERCATOR_LIMIT) * 180.0
    lat = (float(y) / WEB_MERCATOR_LIMIT) * 180.0
    lat = 180.0 / math.pi * (2.0 * math.atan(math.exp(lat * math.pi / 180.0)) - math.pi / 2.0)
    return lon, lat


def bounds_from_info(info):
    wgs84_extent = info.get("wgs84Extent", {}).get("coordinates")
    wgs84_points = flatten_coordinates(wgs84_extent)
    if wgs84_points:
        lngs = [point[0] for point in wgs84_points]
        lats = [point[1] for point in wgs84_points]
        return {
            "north": max(lats),
            "south": min(lats),
            "east": max(lngs),
            "west": min(lngs),
        }

    corners = info.get("cornerCoordinates", {})
    source_points = [
        corners.get("upperLeft"),
        corners.get("upperRight"),
        corners.get("lowerRight"),
        corners.get("lowerLeft"),
    ]
    projected_points = [point for point in source_points if isinstance(point, list) and len(point) >= 2]
    if len(projected_points) < 2:
        raise ValueError("Bornes geographiques introuvables dans gdalinfo.")

    wgs_points = [mercator_to_wgs84(point[0], point[1]) for point in projected_points]
    lngs = [point[0] for point in wgs_points]
    lats = [point[1] for point in wgs_points]
    return {
        "north": max(lats),
        "south": min(lats),
        "east": max(lngs),
        "west": min(lngs),
    }


def overlay_size(info, max_size):
    size = info.get("size", [])
    if len(size) < 2:
        raise ValueError("Taille raster introuvable dans gdalinfo.")

    width = int(size[0])
    height = int(size[1])
    ratio = min(1.0, float(max_size) / max(width, height))
    return max(1, round(width * ratio)), max(1, round(height * ratio))


def band_args(info):
    bands = info.get("bands", [])
    if len(bands) >= 4:
        return ["-b", "1", "-b", "2", "-b", "3", "-b", "4"]
    if len(bands) >= 3:
        return ["-b", "1", "-b", "2", "-b", "3"]
    return []


def main():
    parser = argparse.ArgumentParser(description="Genere une image georeferencee unique pour affichage Leaflet rapide.")
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--logs", required=True)
    parser.add_argument("--max-size", type=int, default=4096)
    args = parser.parse_args()

    gdalinfo = shutil.which("gdalinfo")
    gdal_translate = shutil.which("gdal_translate")
    if gdalinfo is None or gdal_translate is None:
        emit(False, "GDAL doit etre installe : gdalinfo et gdal_translate sont requis pour l'apercu rapide.")
        return

    source_path = Path(args.source)
    output_path = Path(args.output)
    logs_dir = Path(args.logs)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        info_command = [gdalinfo, "-json", str(source_path)]
        info_result = subprocess.run(info_command, capture_output=True, text=True, check=False)
        if info_result.returncode != 0:
            write_log(logs_dir, f"$ {' '.join(info_command)}\n\nSTDOUT:\n{info_result.stdout}\n\nSTDERR:\n{info_result.stderr}")
            emit(False, "Impossible de lire les informations geographiques du GeoTIFF.")
            return

        info = json.loads(info_result.stdout)
        width, height = overlay_size(info, args.max_size)
        bounds = bounds_from_info(info)

        translate_command = [
            gdal_translate,
            "-of",
            "PNG",
            "-outsize",
            str(width),
            str(height),
            "-r",
            "bilinear",
            "-co",
            "ZLEVEL=6",
            *band_args(info),
            str(source_path),
            str(output_path),
        ]
        completed = subprocess.run(translate_command, capture_output=True, text=True, check=False)
        write_log(
            logs_dir,
            f"$ {' '.join(info_command)}\n\nSTDOUT:\n{info_result.stdout}\n\nSTDERR:\n{info_result.stderr}\n\n"
            f"$ {' '.join(translate_command)}\n\nSTDOUT:\n{completed.stdout}\n\nSTDERR:\n{completed.stderr}",
        )
        if completed.returncode != 0:
            emit(False, "Echec de creation de l'apercu rapide. Consultez les logs du projet.")
            return

        emit(
            True,
            "Apercu rapide genere.",
            imagePath=str(output_path),
            imageUrl=output_path.resolve().as_uri(),
            bounds=bounds,
            width=width,
            height=height,
        )
    except Exception as exc:
        write_log(logs_dir, str(exc))
        emit(False, "Echec inattendu de creation de l'apercu rapide. Consultez les logs du projet.")


if __name__ == "__main__":
    main()
