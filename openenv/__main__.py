from __future__ import annotations

import importlib
import sys
from pathlib import Path

def validate(root: Path) -> int:
    config_path = root / "openenv.yaml"
    if not config_path.exists():
        print("openenv validate: missing openenv.yaml")
        return 1

    data = {}
    for raw_line in config_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or ":" not in line:
            continue
        key, value = line.split(":", 1)
        data[key.strip()] = value.strip().strip('"').strip("'")
    errors: list[str] = []

    entry_point = data.get("entry_point")
    action = data.get("action")
    observation = data.get("observation")

    for name, value in {
        "entry_point": entry_point,
        "action": action,
        "observation": observation,
    }.items():
        if not value or ":" not in value:
            errors.append(f"{name} must be in module:symbol format")
            continue
        module_name, symbol = value.split(":", 1)
        try:
            module = importlib.import_module(module_name)
            getattr(module, symbol)
        except Exception as exc:
            errors.append(f"{name} import failed: {exc}")

    if errors:
        for error in errors:
            print(f"openenv validate: {error}")
        return 1

    print("openenv validate: success")
    return 0


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if len(args) >= 1 and args[0] == "validate":
        root = Path(args[1]).resolve() if len(args) > 1 else Path.cwd()
        return validate(root)
    print("Usage: python -m openenv validate [path]")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
