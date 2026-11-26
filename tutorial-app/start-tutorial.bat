@echo off
cd /d "%~dp0"
if not exist "node_modules" (
  echo Installing Tutorial App dependencies...
  call npm install
)
echo Starting Uni-Assistant Tutorial Mode on http://localhost:5174 ...
start "" "http://localhost:5174"
call npm run dev
