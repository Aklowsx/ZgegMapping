#!/usr/bin/env python3
import json
import shutil


def main():
    dependencies = {
        "gdal_translate": shutil.which("gdal_translate") is not None,
        "gdalinfo": shutil.which("gdalinfo") is not None,
        "gdalwarp": shutil.which("gdalwarp") is not None,
        "gdal2tiles": shutil.which("gdal2tiles") is not None or shutil.which("gdal2tiles.py") is not None,
        "pdftoppm": shutil.which("pdftoppm") is not None,
    }

    print(
        json.dumps(
            {
                "success": True,
                "message": "Verification terminee.",
                "dependencies": dependencies,
            }
        )
    )


if __name__ == "__main__":
    main()
