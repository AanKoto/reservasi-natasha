# Reservasi Natasha Casablanca (web)

1. Install Node.js 18+ (nodejs.org).
2. Google Cloud Console: buat project, aktifkan "Google Calendar API", buat "OAuth client ID" tipe Web application
   dengan Authorized redirect URI `http://localhost:3000/oauth2callback`. Salin Client ID dan Client Secret.
3. `npm install`, lalu salin `.env.example` menjadi `.env` dan isi GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ADMIN_PIN.
4. `npm run auth` -> buka link yang muncul -> login dengan akun Google klinik -> salin GOOGLE_REFRESH_TOKEN ke `.env`.
5. `npm start` -> buka http://localhost:3000 (pengunjung) dan http://localhost:3000/admin.html (admin).
