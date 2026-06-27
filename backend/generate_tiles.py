#!/usr/bin/env python3
import argparse
import json
import shutil
import subprocess
from pathlib import Path


def emit(success: bool, message: str, **extra):
    print(json.dumps({"success": success, "message": message, **extra}))


def write_log(logs_dir: Path, content: str):
    logs_dir.mkdir(parents=True, exist_ok=True)
    (logs_dir / "generate_tiles.log").write_text(content, encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description="Genere des tuiles XYZ compatibles Leaflet.")
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--logs", required=True)
    parser.add_argument("--zoom", default="0-22")
    args = parser.parse_args()

    gdal2tiles = shutil.which("gdal2tiles") or shutil.which("gdal2tiles.py")
    if gdal2tiles is None:
        emit(False, "gdal2tiles est introuvable. Installez GDAL pour generer les tuiles.")
        return

    source_path = Path(args.source)
    output_path = Path(args.output)
    output_path.mkdir(parents=True, exist_ok=True)

    command = [
        gdal2tiles,
        "--xyz",
        "-z",
        args.zoom,
        "-w",
        "none",
        str(source_path),
        str(output_path),
    ]

    try:
        completed = subprocess.run(command, capture_output=True, text=True, check=False)
        write_log(Path(args.logs), f"$ {' '.join(command)}\n\nSTDOUT:\n{completed.stdout}\n\nSTDERR:\n{completed.stderr}")
        if completed.returncode != 0:
            emit(False, "Echec de generation des tuiles. Consultez les logs du projet.")
            return

        url_template = f"{output_path.resolve().as_uri()}/{{z}}/{{x}}/{{y}}.png"
        emit(True, "Tuiles locales generees.", tilesPath=str(output_path), urlTemplate=url_template)
    except Exception as exc:
        write_log(Path(args.logs), str(exc))
        emit(False, "Echec inattendu de generation des tuiles. Consultez les logs du projet.")


if __name__ == "__main__":
    main()
