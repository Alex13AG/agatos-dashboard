const express = require('express');
const https = require('https');
const fs = require('fs');
const app = express();

const DATA_FILE = '/root/dashboard/data.json';
const GITHUB_REPO = 'Alex13AG/agatos-dashboard';
let _ghSha = null;

function readData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch(e) { return { clients: [], lost: [], managers: [] }; }
}
function writeData(d) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2));
  pushToGithub(d).catch(e => console.error('GitHub push error:', e.message));
}

function githubRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.github.com',
      path,
      method,
      headers: {
        'Authorization': 'token ' + process.env.GITHUB_TOKEN,
        'User-Agent': 'agatos-dashboard',
        'Accept': 'application/vnd.github.v3+json',
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve({}); } });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function pushToGithub(data) {
  if (!process.env.GITHUB_TOKEN) return;
  const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
  const body = { message: 'update data', content };
  if (_ghSha) body.sha = _ghSha;
  const result = await githubRequest('PUT', `/repos/${GITHUB_REPO}/contents/data.json`, body);
  if (result.content && result.content.sha) _ghSha = result.content.sha;
}

async function pullFromGithub() {
  if (!process.env.GITHUB_TOKEN) return;
  try {
    const result = await githubRequest('GET', `/repos/${GITHUB_REPO}/contents/data.json`);
    if (result.content) {
      _ghSha = result.sha;
      const data = JSON.parse(Buffer.from(result.content, 'base64').toString('utf8'));
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
      console.log('Data pulled from GitHub');
    }
  } catch(e) { console.error('GitHub pull error:', e.message); }
}

pullFromGithub();

const AMO_DOMAIN = 'agatoestet.amocrm.ru';
const LONG_TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6IjZjODgxYjkwYTlmMDY0MzZiOGVlYzcxN2FiYjkzZGE3ZjBhYTFlZDZiZjIzNmU3ZmFkNjIxYTQ5MTA1NTI3YTJlZDczOTNhMzY4MDE0MmMxIn0.eyJhdWQiOiIzZWI1YmY5OS1lYTc1LTQyYzYtYjdhOC1mNzhjNjRhM2Y3NGEiLCJqdGkiOiI2Yzg4MWI5MGE5ZjA2NDM2YjhlZWM3MTdhYmI5M2RhN2YwYWExZWQ2YmYyMzZlN2ZhZDYyMWE0OTEwNTUyN2EyZWQ3MzkzYTM2ODAxNDJjMSIsImlhdCI6MTc4ODc2NzgzMywibmJmIjoxNzg4NzY3ODMzLCJleHAiOjE5NDU5MDA4MDAsInN1YiI6Ijk1MTIwMTAiLCJncmFudF90eXBlIjoiIiwiYWNjb3VudF9pZCI6MzEwMDk3MjIsImJhc2VfZG9tYWluIjoiYW1vY3JtLnJ1IiwidmVyc2lvbiI6Miwic2NvcGVzIjpbInB1c2hfbm90aWZpY2F0aW9ucyIsImZpbGVzIiwiY3JtIiwiZmlsZXNfZGVsZXRlIiwibm90aWZpY2F0aW9ucyJdLCJoYXNoX3V1aWQiOiJjMWUxYmI5Yi1hZDhkLTRlMTktOWRhNy1lYTlhNWEzNDdhZWMiLCJhcGlfZG9tYWluIjoiYXBpLWIuYW1vY3JtLnJ1In0.EMiN5-GSP2DVLL0Kuu1d9sKd9ga1usyleYMOMWLZbwg0j901S67WpXNl2BaV6AaDoejbiGyWvxuEyKPrAuuCM-c1dikO0zxHe4TyRErgZAZEIy0dW1jwGMeU7ZRa8Q7hNjSlBlN6Y3DgHlee2DMg8_93fhbVqhPnBNGDJHHKhLEZiLVshCWNNV4BgDVb6sdOK6eO11xP_2CLn5xKMbHmY0su2vXovss5vFKSD4TW1biNJY3papX1rNV1oPqB27Id9qvln-G1f3-v4lfScHsf7Q9UI0X9A6mYrpndlgk3UpXWOQVcY0LaEM_fo0CSLZ5JeZWC0ozOX9fSXC2UOd3uYQ';

app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.get('/api/data', (req, res) => {
  res.json(readData());
});

app.post('/api/data', (req, res) => {
  try {
    const { clients, lost, managers } = req.body;
    writeData({ clients: clients || [], lost: lost || [], managers: managers || [] });
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

function amoGet(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: AMO_DOMAIN,
      path,
      method: 'GET',
      headers: { Authorization: 'Bearer ' + LONG_TOKEN }
    };
    https.get(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function amoPatch(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options = {
      hostname: AMO_DOMAIN,
      path,
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer ' + LONG_TOKEN,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve({}); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// Cache users: id -> name
let usersCache = null;
async function getUsers() {
  if (usersCache) return usersCache;
  try {
    const data = await amoGet('/api/v4/users?limit=50');
    const users = data?._embedded?.users || [];
    usersCache = {};
    users.forEach(u => { usersCache[String(u.id)] = u.name; });
  } catch(e) {
    usersCache = {};
  }
  return usersCache;
}

// Map AmoCRM stage IDs to Russian names (pipeline 7713126)
const STAGE_MAP = {
  '58680978': 'Вызваниваем',
  '58680982': 'Показ объекта',
  '58680986': 'Зум',
  '58680990': 'Согласование условий',
  '58680994': 'Одобрение ипотеки',
  '58680998': 'Трейд-ин',
  '58681002': 'Продаёт своё',
  '58681006': 'Бронь оплачена',
  '58681010': 'Подготовка документов',
  '58681014': 'Ждём лот',
  '58681018': 'Выход на сделку',
  '142': 'Закрытая сделка',
};

// GET /api/search?q=Иванов
app.get('/api/search', async (req, res) => {
  const q = req.query.q;
  if (!q || q.length < 2) return res.json([]);

  try {
    const [data, users] = await Promise.all([
      amoGet('/api/v4/leads?query=' + encodeURIComponent(q) + '&with=contacts&limit=20'),
      getUsers()
    ]);
    const leads = (data && data._embedded && data._embedded.leads) ? data._embedded.leads : [];

    // Fetch contact details (with custom fields) for phone numbers
    const contactIds = leads
      .map(l => l._embedded && l._embedded.contacts && l._embedded.contacts[0] ? l._embedded.contacts[0].id : null)
      .filter(Boolean);
    let contactMap = {};
    if (contactIds.length) {
      try {
        const query = contactIds.map(id => 'id[]=' + id).join('&');
        const cd = await amoGet('/api/v4/contacts?' + query);
        const contacts = (cd && cd._embedded && cd._embedded.contacts) ? cd._embedded.contacts : [];
        contacts.forEach(c => {
          const phone = c.custom_fields_values
            ? ((c.custom_fields_values.find(f => f.field_code === 'PHONE') || {values:[{}]}).values[0].value || '')
            : '';
          contactMap[c.id] = { phone, name: c.name };
        });
      } catch(e) {}
    }

    const results = leads.map(lead => {
      const contactRef = lead._embedded && lead._embedded.contacts ? lead._embedded.contacts[0] : null;
      const contactDetail = contactRef ? contactMap[contactRef.id] : null;
      const stageName = STAGE_MAP[String(lead.status_id)] || 'Вызваниваем';
      const phone = (contactDetail && contactDetail.phone) || '';
      const name = (contactDetail && contactDetail.name) || (contactRef && contactRef.name) || lead.name;
      const mgrId = String(lead.responsible_user_id || '');
      const mgrName = users[mgrId] || '';
      const sumMln = lead.price ? Math.round(lead.price / 100000) / 10 : 0;

      return {
        crm: String(lead.id),
        crmUrl: 'https://' + AMO_DOMAIN + '/leads/detail/' + lead.id,
        name,
        phone,
        obj: lead.name,
        sum: sumMln,
        stage: stageName,
        mgrId,
        mgr: mgrName,
      };
    });

    res.json(results);
  } catch (err) {
    console.error('AmoCRM error:', err.message);
    res.status(500).json({ error: 'AmoCRM API error' });
  }
});

// PATCH /api/lead/:id — update responsible manager
app.patch('/api/lead/:id', async (req, res) => {
  const { responsible_user_id } = req.body;
  if (!responsible_user_id) return res.status(400).json({ error: 'responsible_user_id required' });
  try {
    const data = await amoPatch('/api/v4/leads/' + req.params.id, { responsible_user_id: Number(responsible_user_id) });
    res.json({ ok: true, data });
  } catch (err) {
    console.error('AmoCRM PATCH error:', err.message);
    res.status(500).json({ error: 'AmoCRM API error' });
  }
});

// GET /api/lead/:id — fetch single lead with contacts
app.get('/api/lead/:id', async (req, res) => {
  try {
    const data = await amoGet(`/api/v4/leads/${req.params.id}?with=contacts`);
    const contact = data?._embedded?.contacts?.[0];
    const stageName = STAGE_MAP[data.status_id] || 'Вызваниваем';
    const phone = contact?.custom_fields_values
      ?.find(f => f.field_code === 'PHONE')
      ?.values?.[0]?.value || '';

    res.json({
      crm: String(data.id),
      name: contact?.name || data.name,
      phone,
      obj: data.name,
      sum: data.price || 0,
      stage: stageName,
      mgr: '',
    });
  } catch (err) {
    res.status(500).json({ error: 'AmoCRM API error' });
  }
});

// ── Google Calendar ──────────────────────────────────────────────────────────
const { google } = require('googleapis');
const TOKENS_FILE = '/root/dashboard/google-tokens.json';
const TOKENS_ROP_FILE = '/root/dashboard/google-tokens-rop.json';

function getGoogleCreds() {
  try {
    return JSON.parse(fs.readFileSync('/root/dashboard/google-creds.json', 'utf8'));
  } catch(e) { return {}; }
}

function getOAuth2Client(redirectPath = '/auth/callback') {
  const creds = getGoogleCreds();
  return new google.auth.OAuth2(
    creds.client_id || process.env.GOOGLE_CLIENT_ID,
    creds.client_secret || process.env.GOOGLE_CLIENT_SECRET,
    'http://localhost:3000' + redirectPath
  );
}

function loadTokens() {
  try { return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8')); }
  catch(e) { return null; }
}

function saveTokens(tokens) {
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
}

// Step 1: redirect to Google consent screen
app.get('/auth/google', (req, res) => {
  const auth = getOAuth2Client();
  const url = auth.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar'],
  });
  res.redirect(url);
});

// Step 2: Google redirects here with ?code=... (owner)
app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('No code');
  try {
    const auth = getOAuth2Client('/auth/callback');
    const { tokens } = await auth.getToken(code);
    saveTokens(tokens);
    res.send('<h2>✅ Google Calendar авторизован! Можно закрыть эту страницу.</h2>');
  } catch(e) {
    res.status(500).send('Auth error: ' + e.message);
  }
});

// РОП auth
app.get('/auth/google/rop', (req, res) => {
  const auth = getOAuth2Client('/auth/callback/rop');
  const url = auth.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar'],
  });
  res.redirect(url);
});

app.get('/auth/callback/rop', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('No code');
  try {
    const auth = getOAuth2Client('/auth/callback/rop');
    const { tokens } = await auth.getToken(code);
    fs.writeFileSync(TOKENS_ROP_FILE, JSON.stringify(tokens, null, 2));
    res.send('<h2>✅ Календарь РОПа авторизован! Можно закрыть эту страницу.</h2>');
  } catch(e) {
    res.status(500).send('Auth error: ' + e.message);
  }
});

// POST /api/calendar/event — create event
// body: { title, date, calendarId, description }
app.post('/api/calendar/event', async (req, res) => {
  const { title, date, calendarId = 'primary', description = '', attendees = '', ropOnly = false, colorId } = req.body;
  if (!title || !date) return res.status(400).json({ error: 'title and date required' });

  let tokens = loadTokens();
  let tokenFile = TOKENS_FILE;
  if (ropOnly) {
    try {
      const ropTok = JSON.parse(fs.readFileSync(TOKENS_ROP_FILE, 'utf8'));
      if (ropTok) { tokens = ropTok; tokenFile = TOKENS_ROP_FILE; }
    } catch(e) { /* fallback to owner tokens */ }
  }
  if (!tokens) return res.status(401).json({ error: 'Not authorized. Visit /auth/google first.' });

  try {
    const auth = getOAuth2Client();
    auth.setCredentials(tokens);
    auth.on('tokens', (newTokens) => {
      if (newTokens.refresh_token) {
        const merged = { ...tokens, ...newTokens };
        fs.writeFileSync(tokenFile, JSON.stringify(merged, null, 2));
      }
    });

    const calendar = google.calendar({ version: 'v3', auth });
    const event = {
      summary: title,
      description,
      start: { date },
      end: { date },
      ...(colorId && { colorId }),
    };
    if (attendees) {
      event.attendees = attendees.split(',').map(e => ({ email: e.trim() })).filter(a => a.email);
    }
    const result = await calendar.events.insert({
      calendarId,
      resource: event,
      sendUpdates: 'all',
    });

    res.json({ ok: true, eventId: result.data.id, link: result.data.htmlLink });
  } catch(e) {
    console.error('Calendar error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.use(require('express').static('/root/dashboard'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`AmoCRM proxy running on port ${PORT}`));
