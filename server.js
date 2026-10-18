require('dotenv').config();
const express = require('express');
const path = require('path');
const { google } = require('googleapis');

const TZ = 'Asia/Jakarta', CAP = 2, WA = process.env.WA_NUMBER || '6285156577652';
const CAL_ID = process.env.CALENDAR_ID || 'primary';
const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, 'http://localhost:3000/oauth2callback');
auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
const cal = google.calendar({ version: 'v3', auth });

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const bad = (m, c = 400) => Object.assign(new Error(m), { status: c });
const w = f => (q, s) => f(q, s).catch(e => { console.error(e.message); s.status(e.status || 500).json({ error: e.message }); });
const SERVICES = [
  'Konsultasi Dokter — Doctor Consultation (Free)',
  'Facial / Peeling — Facial / Peel Treatment',
  'Konsultasi + Treatment — Consultation + Treatment',
  'Tindakan Dokter — Doctor Procedure',
  'Pembelian Produk — Product Purchase',
  'Kontrol / Follow Up — Follow-Up Visit',
];
const hh = h => String(h).padStart(2, '0');
const todayJkt = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
const nowHour = () => +new Date().toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).slice(0, 2);

// Aturan jam: Sen-Sab 09.00-20.00 (reservasi terakhir 18.00), Minggu 09.00-17.00 (terakhir 15.00), jeda 1 jam
const hoursFor = date => {
  const last = new Date(date + 'T12:00:00Z').getUTCDay() === 0 ? 15 : 18;
  return Array.from({ length: last - 8 }, (_, i) => i + 9);
};
const validDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && !isNaN(new Date(d + 'T12:00:00Z'));

async function dayEvents(date) {
  const r = await cal.events.list({
    calendarId: CAL_ID, timeMin: `${date}T00:00:00+07:00`, timeMax: `${date}T23:59:59+07:00`,
    singleEvents: true, timeZone: TZ, privateExtendedProperty: 'app=reservasi', maxResults: 250,
  });
  return r.data.items || [];
}

async function slots(date) {
  if (!validDate(date)) throw bad('Tanggal tidak valid');
  const ev = await dayEvents(date);
  return hoursFor(date).map(h => {
    const items = ev.filter(e => e.start.dateTime && e.start.dateTime.slice(11, 13) === hh(h)).map(e => {
      const p = e.extendedProperties.private;
      return { id: e.id, name: p.name, phone: p.phone, layanan: p.layanan || '', pax: +p.pax || 0, source: p.source, blocked: p.blocked === '1' };
    });
    const blocked = items.some(i => i.blocked);
    const used = items.reduce((n, i) => n + i.pax, 0);
    const past = date < todayJkt() || (date === todayJkt() && h <= nowHour());
    return { time: hh(h) + ':00', used, blocked, past, left: blocked || past ? 0 : Math.max(0, CAP - used), items };
  });
}

async function ensureFree(date, time, n, admin) {
  const s = (await slots(date)).find(x => x.time === time);
  if (!s) throw bad('Jam di luar jam reservasi');
  if (s.blocked) throw bad('Slot ditutup');
  if (!admin && s.past) throw bad('Slot sudah lewat');
  if (CAP - s.used < n) throw bad('Kuota slot tidak cukup');
}

function createEvent(date, time, o) {
  const h = +time.slice(0, 2);
  return cal.events.insert({
    calendarId: CAL_ID, sendUpdates: o.email ? 'all' : 'none',
    requestBody: {
      summary: o.blocked ? 'DITUTUP - Reservasi' : `Reservasi: ${o.name} (${o.pax} orang)`,
      description: o.blocked ? 'Slot ditutup admin' : `Nama: ${o.name}\nNo HP: ${o.phone}\nBerapa Orang: ${o.pax}\nSumber: ${o.source}\nLayanan: ${o.layanan || '-'}`,
      start: { dateTime: `${date}T${hh(h)}:00:00+07:00`, timeZone: TZ },
      end: { dateTime: `${date}T${hh(h + 1)}:00:00+07:00`, timeZone: TZ },
      attendees: o.email ? [{ email: o.email }] : undefined,
      extendedProperties: { private: { app: 'reservasi', pax: String(o.blocked ? 0 : o.pax), name: o.name || '', phone: o.phone || '', layanan: o.layanan || '', source: o.source || 'online', blocked: o.blocked ? '1' : '0' } },
    },
  });
}

// ---------- Publik ----------
app.get('/api/slots', w(async (q, s) => {
  const list = await slots(q.query.date);
  s.json({ slots: list.map(({ time, left, past }) => ({ time, left, past })) });
}));

app.post('/api/book', w(async (q, s) => {
  const { name, phone, email, pax, date, time, layanan } = q.body || {};
  const n = +pax;
  if (!name || !name.trim() || !/^[0-9+\-\s]{8,16}$/.test(phone || '') || (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) || ![1, 2].includes(n) || !Array.isArray(layanan) || !layanan.length || !layanan.every(x => SERVICES.includes(x)) || !/^\d\d:00$/.test(time || ''))
    throw bad('Data belum lengkap atau tidak valid');
  await ensureFree(date, time, n, false);
  await createEvent(date, time, { name: name.trim(), phone, email, pax: n, layanan: layanan.join(', '), source: 'online' });
  const tgl = new Date(date + 'T12:00:00Z').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const msg = `Halo Natasha Casablanca, saya ingin konfirmasi reservasi.\nNama: ${name.trim()}\nNo HP: ${phone}\nBerapa Orang: ${n}\nTanggal: ${tgl}\nJam: ${time.replace(':', '.')}\nLayanan: ${layanan.join(', ')}`;
  s.json({ ok: true, wa: `https://wa.me/${WA}?text=${encodeURIComponent(msg)}` });
}));

// ---------- Admin (PIN) ----------
const admin = (q, s, next) => (q.get('x-admin-pin') && q.get('x-admin-pin') === process.env.ADMIN_PIN) ? next() : s.status(401).json({ error: 'PIN salah' });

app.get('/api/admin/slots', admin, w(async (q, s) => s.json({ slots: await slots(q.query.date) })));

app.post('/api/admin/add', admin, w(async (q, s) => {
  const { date, time, pax, name, phone, email } = q.body || {};
  const n = +pax;
  if (!name || ![1, 2].includes(n)) throw bad('Nama dan jumlah orang wajib diisi');
  await ensureFree(date, time, n, true);
  await createEvent(date, time, { name: name.trim(), phone: phone || '-', email: email || '', pax: n, source: 'manual' });
  s.json({ ok: true });
}));

app.post('/api/admin/block', admin, w(async (q, s) => {
  const { date, time } = q.body || {};
  if (!(await slots(date)).some(x => x.time === time)) throw bad('Jam tidak valid');
  await createEvent(date, time, { blocked: true, source: 'manual' });
  s.json({ ok: true });
}));

app.delete('/api/admin/event/:id', admin, w(async (q, s) => {
  await cal.events.delete({ calendarId: CAL_ID, eventId: q.params.id, sendUpdates: 'all' });
  s.json({ ok: true });
}));

app.listen(process.env.PORT || 3000, () => console.log('Reservasi berjalan di http://localhost:' + (process.env.PORT || 3000)));
