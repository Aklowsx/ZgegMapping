#!/usr/bin/env python3
import argparse
import json
from pathlib import Path


def emit(success: bool, message: str, **extra):
    print(json.dumps({"success": success, "message": message, **extra}))


def write_log(logs_dir: Path, content: str):
    logs_dir.mkdir(parents=True, exist_ok=True)
    (logs_dir / "remove_background.log").write_text(content, encoding="utf-8")


def parse_color(value: str):
    color = value.strip().lstrip("#")
    if len(color) != 6:
        raise ValueError("Couleur invalide.")
    return tuple(int(color[index : index + 2], 16) for index in (0, 2, 4))


def threshold_channel(channel, target: int, tolerance: int):
    lookup = [255 if abs(value - target) <= tolerance else 0 for value in range(256)]
    return channel.point(lookup, mode="L")


def main():
    parser = argparse.ArgumentParser(description="Rend transparent un fond proche d'une couleur cible.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--color", required=True)
    parser.add_argument("--tolerance", type=int, default=16)
    parser.add_argument("--logs", required=True)
    args = parser.parse_args()

    try:
        from PIL import Image, ImageChops
    except Exception:
        emit(False, "Suppression du fond indisponible : installer Pillow pour traiter les pixels.")
        return

    input_path = Path(args.input)
    output_path = Path(args.output)
    logs_dir = Path(args.logs)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        tolerance = max(0, min(255, int(args.tolerance)))
        red, green, blue = parse_color(args.color)

        image = Image.open(input_path).convert("RGBA")
        r, g, b, alpha = image.split()
        red_mask = threshold_channel(r, red, tolerance)
        green_mask = threshold_channel(g, green, tolerance)
        blue_mask = threshold_channel(b, blue, tolerance)
        remove_mask = ImageChops.multiply(ImageChops.multiply(red_mask, green_mask), blue_mask)
        keep_mask = remove_mask.point([255 - value for value in range(256)], mode="L")
        next_alpha = ImageChops.multiply(alpha, keep_mask)
        result = Image.merge("RGBA", (r, g, b, next_alpha))
        result.save(output_path, format="PNG", optimize=True)

        removed_pixels = remove_mask.histogram()[255]
        emit(
            True,
            f"Fond supprime : {removed_pixels} pixel(s) rendus transparents.",
            output=str(output_path),
            removedPixels=removed_pixels,
        )
    except Exception as exc:
        write_log(logs_dir, str(exc))
        emit(False, "Echec de suppression du fond. Consultez les logs du projet.")


if __name__ == "__main__":
    main()
