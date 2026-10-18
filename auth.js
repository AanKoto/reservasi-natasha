// Jalankan sekali: node auth.js  -> login dengan akun Google klinik -> salin refresh token ke .env
require('dotenv').config();
const http = require('http');
const { google } = require('googleapis');
const redirect = 'http://localhost:3000/oauth2callback';
const o = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, redirect);
console.log('\nBuka link ini di browser dan login dengan akun Google klinik:\n');
console.log(o.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: ['https://www.googleapis.com/auth/calendar.events'] }), '\n');
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost:3000');
  if (u.pathname !== '/oauth2callback') return res.end();
  try {
    const { tokens } = await o.getToken(u.searchParams.get('code'));
    res.end('Berhasil. Kembali ke terminal dan salin GOOGLE_REFRESH_TOKEN ke file .env.');
    console.log('GOOGLE_REFRESH_TOKEN=' + tokens.refresh_token);
  } catch (e) { res.end('Gagal: ' + e.message); console.error(e.message); }
  setTimeout(() => process.exit(0), 500);
}).listen(3000);
