@echo off
cd /d "%~dp0"
echo Starting SPHEREx Observatory at http://127.0.0.1:4173
echo Keep this window open while using the dashboard.
start "" "http://127.0.0.1:4173"
node server.mjs
pause
