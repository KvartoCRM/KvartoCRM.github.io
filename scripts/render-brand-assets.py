from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "kvarto-icon-512.png"
RES = ROOT / "android" / "app" / "src" / "main" / "res"

LAUNCHER_SIZES = {
    "ldpi": 36,
    "mdpi": 48,
    "hdpi": 72,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192,
}

FOREGROUND_SIZES = {
    "mdpi": 108,
    "hdpi": 162,
    "xhdpi": 216,
    "xxhdpi": 324,
    "xxxhdpi": 432,
}


def save_resized(source: Image.Image, path: Path, size: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    source.resize((size, size), Image.Resampling.LANCZOS).save(path, "PNG", optimize=True)


with Image.open(SOURCE).convert("RGBA") as icon:
    for density, size in LAUNCHER_SIZES.items():
        folder = RES / f"mipmap-{density}"
        save_resized(icon, folder / "ic_launcher.png", size)
        save_resized(icon, folder / "ic_launcher_round.png", size)

    for density, size in FOREGROUND_SIZES.items():
        save_resized(icon, RES / f"mipmap-{density}" / "ic_launcher_foreground.png", size)

