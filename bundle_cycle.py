import json
from pathlib import Path
from datetime import datetime

# Use the folder where this script is located
folder = Path(__file__).resolve().parent

# Find all JSON files except the output file itself
json_files = sorted(
    p for p in folder.glob("*.json")
    if not p.name.endswith("-Master.json")
)

def derive_master_name(paths):
    first = paths[0].stem if paths else "MASTER"
    parts = [part.strip() for part in first.replace("_", "-").split("-") if part.strip()]
    prefix = "-".join(parts[:2]) or "MASTER"
    return f"{prefix}-Master.json"

if not json_files:
    print("❌ No JSON files found.")
    raise SystemExit

print("=== JSON MASTER BUNDLER ===")
print("Folder:", folder)
print("JSON files found:", len(json_files))
print()

files = []
failed = []

for i, path in enumerate(json_files, 1):
    print(f"Reading {i}/{len(json_files)}: {path.name}")

    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)

        files.append({
            "filename": path.name,
            "content": data
        })

    except Exception as e:
        failed.append({
            "filename": path.name,
            "error": str(e)
        })

archive = {
    "bundle_version": "v1124",
    "bundled_at": datetime.now().astimezone().isoformat(),

    "source_files": files,

    "failed_files": failed,

    "summary": {
        "files_found": len(json_files),
        "files_bundled": len(files),
        "failed": len(failed)
    }
}

output = folder / derive_master_name(json_files)

with output.open("w", encoding="utf-8") as f:
    json.dump(
        archive,
        f,
        indent=2,
        ensure_ascii=False
    )

print()
print("==========================================")
print("MASTER JSON BUNDLE COMPLETE")
print("==========================================")
print("Files found:", len(json_files))
print("Files bundled:", len(files))
print("Failed:", len(failed))
print("Output:", output.name)
print("JSON size:", output.stat().st_size)
print("==========================================")