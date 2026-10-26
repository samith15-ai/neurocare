# NeuroCare Local Development Startup Script (PowerShell)
Write-Host "Starting NeuroCare Services..." -ForegroundColor Cyan

# 1. Start Backend API in background job
$apiJob = Start-Job -ScriptBlock {
    Set-Location -Path "$using:PSScriptRoot\..\api"
    & ".\.venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
}

Write-Host "Backend API launched on http://127.0.0.1:8000 (Job ID: $($apiJob.Id))" -ForegroundColor Green

# 2. Start Frontend
Set-Location -Path "$PSScriptRoot\..\web"
npm run dev
