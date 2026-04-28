@echo off
echo 👻 Waking up your Second Brain...

:: 1. Start the FastAPI Backend in a new window
echo Starting Python Backend...
start cmd /k "cd /d C:\Users\Darshan\.gemini\antigravity\scratch\second-brain-backend && .\venv\Scripts\python.exe -m uvicorn main:app --reload"

:: 2. Start the React Frontend in a new window
echo Starting React Dashboard...
start cmd /k "cd /d C:\Users\Darshan\.gemini\antigravity\scratch\second-brain-backend\second-brain-ui && npm run dev"

:: 3. Wait 4 seconds for Vite to spin up
timeout /t 4 /nobreak >nul

:: 4. Open your default web browser to the dashboard
echo Opening Dashboard...
start http://localhost:5173

echo ✅ Ghost Mode Activated!
exit
