#!/usr/bin/env python3
"""
Compress images in the assets folder for web delivery.
Requires: pip install Pillow

Usage: python3 compress-images.py
Output: compressed files in assets/compressed/
"""

import os
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Error: Pillow not installed. Run: pip install Pillow")
    exit(1)

ASSETS_DIR = Path(__file__).parent
OUTPUT_DIR = ASSETS_DIR / 'compressed'
OUTPUT_DIR.mkdir(exist_ok=True)

# Settings per image type
CONFIGS = {
    # PNG logo — reduce to web-friendly size under 100KB
    'arivayya-ai-logo.png': {
        'format': 'PNG',
        'max_width': 400,
        'quality': 85,
        'optimize': True,
        'convert_to_webp': True,
    },
    # Product images — large PNGs, convert to WebP
    'diabetes-ai.png': {
        'format': 'WEBP',
        'max_width': 1200,
        'quality': 82,
        'method': 6,
    },
    'vision-safety.png': {
        'format': 'WEBP',
        'max_width': 1200,
        'quality': 82,
        'method': 6,
    },
    'visual-search.png': {
        'format': 'WEBP',
        'max_width': 1200,
        'quality': 82,
        'method': 6,
    },
    # Chat icon PNG — small, keep as PNG or convert to WebP
    'arivayya-ai-chat-logo.png': {
        'format': 'WEBP',
        'max_width': 200,
        'quality': 88,
    },
    # Poster JPG — compress
    'arivayya-gym-demo-poster.jpg': {
        'format': 'JPEG',
        'max_width': 1280,
        'quality': 75,
    },
}

def get_original_size(path):
    return path.stat().st_size

def compress_image(filename, config):
    src = ASSETS_DIR / filename
    if not src.exists():
        print(f"  ⚠  {filename} not found, skipping")
        return

    original_size = get_original_size(src)
    print(f"\n  Processing: {filename} ({original_size / 1024:.1f} KB)")

    try:
        img = Image.open(src)
        if img.mode in ('RGBA', 'P') and config.get('format') == 'JPEG':
            img = img.convert('RGB')

        max_w = config.get('max_width', 0)
        if max_w and img.width > max_w:
            ratio = max_w / img.width
            new_size = (max_w, int(img.height * ratio))
            img = img.resize(new_size, Image.LANCZOS)
            print(f"    Resized to {new_size[0]}x{new_size[1]}")

        fmt = config.get('format', 'WEBP')

        # Save compressed version
        out_name = OUTPUT_DIR / f"{Path(filename).stem}.{fmt.lower()}"
        save_kwargs = {}
        if fmt == 'WEBP':
            save_kwargs['quality'] = config.get('quality', 82)
            save_kwargs['method'] = config.get('method', 6)
            save_kwargs['lossless'] = False
        elif fmt == 'PNG':
            save_kwargs['optimize'] = config.get('optimize', True)
            save_kwargs['compress_level'] = 9
        elif fmt == 'JPEG':
            save_kwargs['quality'] = config.get('quality', 75)
            save_kwargs['optimize'] = True
            save_kwargs['progressive'] = True

        img.save(out_name, fmt, **save_kwargs)
        new_size = out_name.stat().st_size
        reduction = ((original_size - new_size) / original_size) * 100
        print(f"    Saved:    {out_name.name} ({new_size / 1024:.1f} KB, {reduction:.0f}% reduction)")

        # Also save as WebP if conversion requested
        if config.get('convert_to_webp') and fmt != 'WEBP':
            webp_name = OUTPUT_DIR / f"{Path(filename).stem}.webp"
            img.save(webp_name, 'WEBP', quality=config.get('quality', 85), method=6)
            webp_size = webp_name.stat().st_size
            webp_reduction = ((original_size - webp_size) / original_size) * 100
            print(f"    WebP:     {webp_name.name} ({webp_size / 1024:.1f} KB, {webp_reduction:.0f}% reduction)")

        img.close()

    except Exception as e:
        print(f"    ✗ Error: {e}")

def main():
    print("=" * 60)
    print("Arivayya AI — Image Compression")
    print("=" * 60)

    for filename, config in CONFIGS.items():
        compress_image(filename, config)

    # Summary
    print("\n" + "=" * 60)
    print("Compressed images saved to: " + str(OUTPUT_DIR))
    print("\nTo use the compressed images:")
    print("  1. Copy .webp files to assets/ (replacing originals)")
    print("  2. Update HTML to use .webp extensions with <picture> fallback")
    print("  3. For the logo: replace with the compressed PNG or WebP")
    print("\nVideo compression (manual steps):")
    print("  1. Install ffmpeg: sudo apt install ffmpeg")
    print("  2. Run: ffmpeg -i assets/arivayya-gym-demo-anonymised.mp4 -vcodec libx264 -crf 28 -preset slow -an assets/arivayya-gym-demo-anonymised-compressed.mp4")
    print("     -crf 28 gives good quality at ~50-70% smaller file")
    print("  3. Or use HandBrake GUI: open file → Fast 720p → ~5 MB target")
    print("=" * 60)

if __name__ == '__main__':
    main()
