@echo off
cd /d "%~dp0backend-fixed"
echo Starting repaired SPHEREx API at http://127.0.0.1:8010
echo This API uses official IRSA services, NASA S3, and verified downloaded files.
uv run --no-dev uvicorn main:app --host 127.0.0.1 --port 8010
pause
