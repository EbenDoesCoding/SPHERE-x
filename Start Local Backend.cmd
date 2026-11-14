@echo off
cd /d "%~dp0backend"
echo Optional local backend: http://127.0.0.1:8000
echo In API Lab, change the backend URL to http://127.0.0.1:8000
uv run --no-dev uvicorn main:app --host 127.0.0.1 --port 8000
pause
