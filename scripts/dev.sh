#!/usr/bin/env bash
set -e

echo "Starting NeuroCare Services in Development Mode..."

# Navigate to api and run uvicorn
(cd "$(dirname "$0")/../api" && source .venv/bin/activate 2>/dev/null || true && uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload) &
API_PID=$!

echo "API started with PID $API_PID at http://127.0.0.1:8000"

# Navigate to web and run dev
cd "$(dirname "$0")/../web"
npm run dev

kill $API_PID 2>/dev/null || true
