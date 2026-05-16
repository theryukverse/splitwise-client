require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const crypto = require('crypto');
const path = require('path');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;
const SPLITWISE_API = 'https://secure.splitwise.com/api/v3.0';

// OAuth config (from env)
const OAUTH_CLIENT_ID = process.env.SPLITWISE_CLIENT_ID || '';
const OAUTH_CLIENT_SECRET = process.env.SPLITWISE_CLIENT_SECRET || '';
const OAUTH_AUTHORIZE_URL = 'https://secure.splitwise.com/oauth/authorize';
const OAUTH_TOKEN_URL = 'https://secure.splitwise.com/oauth/token';

// In-memory state store for CSRF protection (state → timestamp)
const oauthStates = new Map();

// Clean up expired states every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [state, ts] of oauthStates) {
    if (now - ts > 10 * 60 * 1000) oauthStates.delete(state);
  }
}, 10 * 60 * 1000);

app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://splitwise-ryuk.vercel.app'
  ],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'X-API-Key', 'Authorization']
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Auth Helper ───────────────────────────────────────────────
// Extracts Bearer token from either Authorization header or X-API-Key
function getAuthHeader(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return { 'Authorization': authHeader, 'Content-Type': 'application/json' };
  }
  const apiKey = req.headers['x-api-key'];
  if (apiKey) {
    return { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
  }
  return null;
}

// ─── OAuth Routes ──────────────────────────────────────────────

// Check if OAuth is configured
app.get('/oauth/status', (req, res) => {
  res.json({ enabled: !!(OAUTH_CLIENT_ID && OAUTH_CLIENT_SECRET) });
});

// Step 1: Redirect to Splitwise authorization page
app.get('/oauth/login', (req, res) => {
  if (!OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET) {
    return res.status(500).json({ error: 'OAuth not configured. Set SPLITWISE_CLIENT_ID and SPLITWISE_CLIENT_SECRET.' });
  }

  const state = crypto.randomBytes(32).toString('hex');
  oauthStates.set(state, Date.now());

  // Determine redirect URI from the request
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.headers['host'];
  const redirectUri = `${protocol}://${host}/oauth/callback`;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: OAUTH_CLIENT_ID,
    redirect_uri: redirectUri,
    state: state,
  });

  res.redirect(`${OAUTH_AUTHORIZE_URL}?${params}`);
});

// Step 2: Handle callback from Splitwise
app.get('/oauth/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`/?oauth_error=${encodeURIComponent(error)}`);
  }

  if (!state || !oauthStates.has(state)) {
    return res.redirect('/?oauth_error=invalid_state');
  }

  oauthStates.delete(state);

  if (!code) {
    return res.redirect('/?oauth_error=no_code');
  }

  try {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.headers['host'];
    const redirectUri = `${protocol}://${host}/oauth/callback`;

    const tokenRes = await fetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: OAUTH_CLIENT_ID,
        client_secret: OAUTH_CLIENT_SECRET,
        code: code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.access_token) {
      res.redirect(`/?token=${encodeURIComponent(tokenData.access_token)}`);
    } else {
      const errMsg = tokenData.error || 'token_exchange_failed';
      res.redirect(`/?oauth_error=${encodeURIComponent(errMsg)}`);
    }
  } catch (err) {
    console.error('OAuth token exchange error:', err);
    res.redirect('/?oauth_error=token_exchange_failed');
  }
});

// ─── Splitwise API Proxy ───────────────────────────────────────

// Get current user
app.get('/api/current-user', async (req, res) => {
  try {
    const headers = getAuthHeader(req);
    if (!headers) return res.status(401).json({ error: 'Authentication required' });

    const response = await fetch(`${SPLITWISE_API}/get_current_user`, { headers });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get friends
app.get('/api/friends', async (req, res) => {
  try {
    const headers = getAuthHeader(req);
    if (!headers) return res.status(401).json({ error: 'Authentication required' });

    const response = await fetch(`${SPLITWISE_API}/get_friends`, { headers });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get groups
app.get('/api/groups', async (req, res) => {
  try {
    const headers = getAuthHeader(req);
    if (!headers) return res.status(401).json({ error: 'Authentication required' });

    const response = await fetch(`${SPLITWISE_API}/get_groups`, { headers });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get currencies
app.get('/api/currencies', async (req, res) => {
  try {
    const headers = getAuthHeader(req);
    if (!headers) return res.status(401).json({ error: 'Authentication required' });

    const response = await fetch(`${SPLITWISE_API}/get_currencies`, { headers });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get categories
app.get('/api/categories', async (req, res) => {
  try {
    const headers = getAuthHeader(req);
    if (!headers) return res.status(401).json({ error: 'Authentication required' });

    const response = await fetch(`${SPLITWISE_API}/get_categories`, { headers });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get expenses
app.get('/api/expenses', async (req, res) => {
  try {
    const headers = getAuthHeader(req);
    if (!headers) return res.status(401).json({ error: 'Authentication required' });

    // Forward all query parameters to Splitwise
    const params = new URLSearchParams(req.query);
    const response = await fetch(`${SPLITWISE_API}/get_expenses?${params}`, { headers });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create expense
app.post('/api/expenses', async (req, res) => {
  try {
    const headers = getAuthHeader(req);
    if (!headers) return res.status(401).json({ error: 'Authentication required' });

    const response = await fetch(`${SPLITWISE_API}/create_expense`, {
      method: 'POST',
      headers,
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Start Server ──────────────────────────────────────────────

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

app.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log('');
  console.log('  🟢 Splitwise Client is running!');
  console.log('');
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Network: http://${localIP}:${PORT}  ← open this on your phone`);
  if (OAUTH_CLIENT_ID) {
    console.log('  OAuth:   ✅ Configured');
  } else {
    console.log('  OAuth:   ❌ Not configured (set SPLITWISE_CLIENT_ID & SPLITWISE_CLIENT_SECRET in .env)');
  }
  console.log('');
});
