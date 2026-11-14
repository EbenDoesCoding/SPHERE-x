@echo off
cd /d "%~dp0..\backend"
uv run --no-dev uvicorn main:app --host 127.0.0.1 --port 8010
pause
