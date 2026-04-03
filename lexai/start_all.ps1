# LexAI — All-in-One Startup Script (Windows)

# 0. Global Fix: Clear broken TLS certificate paths (common with PostgreSQL 17 installations)
$env:CURL_CA_BUNDLE=""
$env:REQUESTS_CA_BUNDLE=""

# 1. Self-Correction: Fix venv if broken/moved
if (Test-Path "backend\venv") {
    Write-Host "🔍 Checking environment..." -ForegroundColor Yellow
    $pyPath = "backend\venv\Scripts\python.exe"
    if (!(Test-Path $pyPath)) {
        Write-Host "⚠️ Broken venv detected! Rebuilding..." -ForegroundColor Red
        Remove-Item -Recurse -Force backend\venv
        python -m venv backend\venv
        .\backend\venv\Scripts\activate
        pip install -r backend\requirements.txt
    }
} else {
    Write-Host "📦 Creating new environment..." -ForegroundColor Cyan
    python -m venv backend\venv
    .\backend\venv\Scripts\activate
    pip install -r backend\requirements.txt
}

# 2. Start FastAPI Backend in new window
Write-Host "🚀 Starting FastAPI Backend..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "$env:CURL_CA_BUNDLE=''; $env:REQUESTS_CA_BUNDLE=''; cd backend; .\venv\Scripts\activate; python -m uvicorn main:app --reload --port 8000"

# 3. Start Celery Worker in new window
Write-Host "⚙️ Starting Celery Worker..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "$env:CURL_CA_BUNDLE=''; $env:REQUESTS_CA_BUNDLE=''; cd backend; .\venv\Scripts\activate; python -m celery -A celery_app worker --loglevel=info -P solo"

# 4. Start Next.js Frontend in new window
Write-Host "🌐 Starting Next.js Frontend..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd frontend; npm run dev"

Write-Host "`n✅ All services triggered! Check the newly opened windows." -ForegroundColor Magenta

