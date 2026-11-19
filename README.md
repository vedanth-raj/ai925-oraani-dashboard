# AI 925 & Oraani Order Management System

Enterprise-grade, local-first jewelry order management system supporting dual brands (**AI 925** and **Oraani**) powered by a unified database, real-time pricing slabs, state-wise premiums, and mobile tunnel connectivity.

---

## 🚀 Quick Start (Brand New PC Setup)

Everything required to run this application (Node.js LTS, npm libraries, frontend build, Cloudflare tunnel) is **automatically installed** by running:

```bat
run.bat
```

1. Double-click **`run.bat`**.
2. If Node.js is missing on your PC, `run.bat` automatically installs Node.js LTS and all dependencies.
3. Once ready, it prints your local dashboard URL (`http://localhost:3000`) and brand customer links:
   - **AI 925 Portal**: `http://localhost:3000/ai925`
   - **Oraani Portal**: `http://localhost:3000/oraani`
   - **Admin Login**: `http://localhost:3000/login`

---

## 🔄 One-Click Live Updates (Zero Data Loss)

Whenever new code or features are pushed to GitHub, run:

```bat
update.bat
```

- **Database Protection**: Automatically creates a timestamped safety backup in `data/backups/`.
- **Pulls Code**: Downloads the latest code via `git pull`.
- **Rebuilds UI**: Rebuilds the frontend in seconds (`npm --prefix client run build`).
- **Zero Overwrite**: Your local database (`data/ai925.db`), orders, and customer records are **never** touched or overwritten.

---

## 📦 Creating Clean Deployment ZIPs

To share a clean copy with someone without Git or without exposing your database:

```bat
package_zip.bat
```

Creates `ai925_oraani_clean_release_*.zip` with `node_modules` and `data/*.db` excluded.

---

## 🔐 Default Admin Credentials

- **System Administrator**: Username: `admin` | Default PIN: `925925`
- **Business Administrator**: Username: `bizadmin` | Default PIN: `888888`
- **Sales Representative**: Username: `rep_ravi` | Default PIN: `123456`
