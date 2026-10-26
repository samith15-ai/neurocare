# NeuroCare Production Deployment Guide: Supabase + Render + Vercel

This guide provides step-by-step instructions for deploying NeuroCare on a modern managed cloud stack:
- **Database**: [Supabase](https://supabase.com) (Managed PostgreSQL)
- **Backend API**: [Render](https://render.com) (FastAPI Python 3.12 Web Service)
- **Frontend PWA**: [Vercel](https://vercel.com) (React 19 + TypeScript + Vite + Auto HTTPS)

---

## Architecture Flow

```mermaid
flowchart LR
    User["Patient / Doctor\n(Mobile / Desktop Browser)"]
    Vercel["Frontend (Vercel)\nhttps://neurocare.vercel.app\n(Auto-HTTPS & PWA Precache)"]
    Render["Backend API (Render)\nhttps://neurocare-api.onrender.com\n(FastAPI Python 3.12)"]
    Supabase[("Database (Supabase)\nPostgreSQL 16\n(Session Pooler / Port 5432)")]

    User -->|HTTPS| Vercel
    Vercel -->|REST / JSON| Render
    Render -->|SQLAlchemy connection pool| Supabase
```

---

## Step 1: Set Up Supabase (PostgreSQL Database)

1. Sign in to [Supabase](https://supabase.com) and click **"New Project"**.
2. Fill in your project details:
   - **Name**: `neurocare-db`
   - **Database Password**: *Choose a strong password and save it securely.*
   - **Region**: Choose the region closest to your users or Render backend (e.g., `East US (North Virginia)` or `Frankfurt`).
3. Once the database is provisioned (approx. 1–2 minutes):
   - Navigate to **Project Settings** (gear icon) $\rightarrow$ **Database**.
   - Scroll to **Connection string** $\rightarrow$ Select the **URI** tab.
   - Choose **Session mode** (Port `5432`) or **Direct connection**:
     ```text
     postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres
     ```
   - Replace `[YOUR-PASSWORD]` with your actual Supabase database password.

> [!NOTE]
> You **do not** need to manually run any SQL table scripts! When the FastAPI backend boots up for the first time, `Base.metadata.create_all()` will automatically create all tables (`users`, `patients`, `assessments`, `features`, `baselines`, `reports`, `audit_logs`, etc.) and seed the initial demo accounts.

---

## Step 2: Deploy Backend API on Render

1. Sign in to [Render](https://render.com) and click **"New" $\rightarrow$ "Web Service"**.
2. Connect your GitHub repository containing NeuroCare.
3. Configure the service settings:
   - **Name**: `neurocare-api`
   - **Region**: Choose the same region as your Supabase database.
   - **Root Directory**: `api`
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Instance Type**: `Free`
4. Add the following **Environment Variables**:

| Variable Key | Value | Description |
|:---|:---|:---|
| `DATABASE_URL` | `postgresql://postgres...` | Your Supabase connection URI from Step 1 |
| `USE_SQLITE` | `False` | Disables SQLite and connects to PostgreSQL |
| `ENVIRONMENT` | `production` | Enables production security mode |
| `DEBUG` | `False` | Disables debug logs |
| `APP_SECRET_KEY` | *(Click "Generate" or enter a 32+ char key)* | Secret key for JWT authentication |
| `CORS_ORIGINS` | `*` *(or your Vercel URL)* | Allows requests from your frontend |

5. Click **"Deploy Web Service"**.
6. Once deployed, Render will display your public API URL (e.g., `https://neurocare-api.onrender.com`).
   - You can verify it works by visiting `https://neurocare-api.onrender.com/api/v1/health` or `https://neurocare-api.onrender.com/docs`.

---

## Step 3: Deploy Frontend PWA on Vercel

1. Sign in to [Vercel](https://vercel.com) and click **"Add New..." $\rightarrow$ "Project"**.
2. Import your GitHub repository.
3. Configure the project:
   - **Framework Preset**: `Vite`
   - **Root Directory**: Click "Edit" and select **`web`**.
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Expand **Environment Variables** and add:

| Variable Key | Value |
|:---|:---|
| `VITE_API_URL` | `https://neurocare-api.onrender.com` *(your Render API URL from Step 2, no trailing slash)* |

5. Click **"Deploy"**.
6. Vercel will build the project and output your live HTTPS domain (e.g., `https://neurocare.vercel.app`).

> [!TIP]
> Thanks to `web/vercel.json`, single-page app routes (like `/doctor`, `/patient`, `/login`) and PWA service workers (`sw.js`) work seamlessly without 404 errors on browser page reloads.

---

## Step 4: Verification & Final Testing

1. Open your live Vercel URL in your browser: `https://neurocare.vercel.app`.
2. Notice the lock icon in the browser address bar confirming **HTTPS** is active.
3. Sign in with the pre-seeded clinical demo credentials:
   - **Doctor Portal**: `doctor@neurocare.org` / `Doctor123!`
   - **Patient Portal**: `patient@neurocare.org` / `Patient123!`
4. Perform an assessment (e.g., Finger Tapping or Speech):
   - The browser will request camera and microphone permissions smoothly over HTTPS.
   - Features will be extracted and saved to Supabase PostgreSQL in real time!
5. Test PWA installation:
   - Click the **"Install App"** button in the top navigation bar to install NeuroCare as an offline-ready standalone application.
