#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if grep -rnP '\t' --include='*.py' --exclude-dir=.venv .; then
    echo "Tabs found in Python files (use spaces)"
    exit 1
fi

uv run python -m compileall -q ./*.py
uv run python -c "import main"
uv run pytest -q
echo "All checks passed"
