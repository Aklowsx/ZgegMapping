#!/usr/bin/env python3
import argparse
import json
import shutil
import subprocess
from pathlib import Path


def emit(success: bool, message: str, **extra):
    print(json.dumps({"success": success, "message": message, **extra}))


def write_log(logs_dir: Path, name: str, content: str):
    logs_dir.mkdir(parents=True, exist_ok=True)
    (logs_dir / name).write_text(content, encoding="utf-8")


def validate_points(points):
    valid = []
    for point in points:
        source = point.get("sourcePixel", {})
        target = point.get("targetLatLng", {})
        try:
            valid.append(
                {
                    "x": float(source["x"]),
                    "y": float(source["y"]),
                    "lat": float(target["lat"]),
                    "lng": float(target["lng"]),
                }
            )
        except (KeyError, TypeError, ValueError):
            continue
    return valid


def main():
    parser = argparse.ArgumentParser(description="Georeference une image avec des GCP GDAL.")
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--points", required=True)
    parser.add_argument("--epsg", default="EPSG:3857")
    parser.add_argument("--logs", required=True)
    args = parser.parse_args()

    gdal_translate = shutil.which("gdal_translate")
    gdalwarp = shutil.which("gdalwarp")
    if gdal_translate is None or gdalwarp is None:
        emit(False, "GDAL doit etre installe : gdal_translate et gdalwarp sont introuvables.")
        return

    source_path = Path(args.source)
    output_path = Path(args.output)
    points_path = Path(args.points)
    logs_dir = Path(args.logs)

    points = validate_points(json.loads(points_path.read_text(encoding="utf-8")))
    if len(points) < 3:
        emit(False, "Au moins 3 points de controle valides sont requis.")
        return

    output_path.parent.mkdir(parents=True, exist_ok=True)
    intermediate_path = output_path.with_name(f"{output_path.stem}-gcps.tif")

    translate_command = [gdal_translate, "-of", "GTiff", "-a_srs", "EPSG:4326"]
    for point in points:
        translate_command.extend(["-gcp", str(point["x"]), str(point["y"]), str(point["lng"]), str(point["lat"])])
    translate_command.extend([str(source_path), str(intermediate_path)])

    warp_command = [
        gdalwarp,
        "-overwrite",
        "-r",
        "bilinear",
        "-t_srs",
        args.epsg,
        "-dstalpha",
        "-of",
        "GTiff",
        "-co",
        "COMPRESS=DEFLATE",
        "-co",
        "PREDICTOR=2",
        "-co",
        "TILED=YES",
        str(intermediate_path),
        str(output_path),
    ]

    try:
        translate = subprocess.run(translate_command, capture_output=True, text=True, check=False)
        write_log(
            logs_dir,
            "georeference-gdal_translate.log",
            f"$ {' '.join(translate_command)}\n\nSTDOUT:\n{translate.stdout}\n\nSTDERR:\n{translate.stderr}",
        )
        if translate.returncode != 0:
            emit(False, "Echec GDAL pendant la creation des points de controle. Consultez les logs du projet.")
            return

        warp = subprocess.run(warp_command, capture_output=True, text=True, check=False)
        write_log(
            logs_dir,
            "georeference-gdalwarp.log",
            f"$ {' '.join(warp_command)}\n\nSTDOUT:\n{warp.stdout}\n\nSTDERR:\n{warp.stderr}",
        )
        if warp.returncode != 0:
            emit(False, "Echec GDAL pendant le georeferencement. Consultez les logs du projet.")
            return

        emit(True, "GeoTIFF cree avec succes.", output=str(output_path))
    except Exception as exc:
        write_log(logs_dir, "georeference-error.log", str(exc))
        emit(False, "Echec inattendu du georeferencement. Consultez les logs du projet.")


if __name__ == "__main__":
    main()
