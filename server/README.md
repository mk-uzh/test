# TrailSafe API (FastAPI + SQLite by default)

By default, users and reset tokens are stored in **`trailsafe.db`** (SQLite) at the project root. Passwords are **bcrypt**-hashed; no database server is required for a local demo.

1. **Optional —** copy `server/.env.example` to `server/.env` and set `JWT_SECRET` to a long random string (recommended even for demos).
2. **Install Python dependencies** (Python 3.10+), from the **project root** (`trailsafe/`):
   ```bash
   py -3 -m pip install -r server/requirements.txt
   ```
3. **Run the app** (serves the static site + `/api` on port 8000), from the **project root**:
   ```bash
   py -3 -m uvicorn server.main:app --app-dir . --host 127.0.0.1 --port 8000
   ```
   Open **http://127.0.0.1:8000** — sign in or register. After login, the main app loads.

**Password reset (demo):** set `DEMO_REVEAL_RESET_TOKEN=1` in `server/.env` to receive a `debug_reset_token` in the JSON from `POST /api/auth/forgot-password` (disable in production).

**MariaDB/MySQL (optional):** from the project root, `docker compose up -d` then set in `server/.env`:
`DATABASE_URL=mysql+pymysql://trailsafe:trailsafe@127.0.0.1:3306/trailsafe` (see `docker-compose.yml`).
