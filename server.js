/**
 * Carnet de Route — API Strava (pour Render Web Service)
 * Rôle unique : garder le Client Secret Strava côté serveur et faire les
 * échanges de token / appels API à la place du navigateur.
 *
 * Variables d'environnement à définir dans Render (Environment) :
 *  - STRAVA_CLIENT_ID
 *  - STRAVA_CLIENT_SECRET
 *  - ALLOWED_ORIGIN     (URL complète de ton site statique, ex: https://carnet-de-route.onrender.com)
 */

const express = require('express');
const app = express();
app.use(express.json());

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

async function stravaTokenRequest(body) {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      ...body,
    }),
  });
  const data = await res.json();
  return { ok: res.ok, data };
}

// Échange initial : code d'autorisation -> access_token + refresh_token
app.post('/exchange', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'code manquant' });

    const { ok, data } = await stravaTokenRequest({ code, grant_type: 'authorization_code' });
    if (!ok) return res.status(400).json({ error: data });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Récupération des activités : rafraîchit le token puis pagine sur Strava
app.post('/activities', async (req, res) => {
  try {
    const { refresh_token, after } = req.body;
    if (!refresh_token) return res.status(400).json({ error: 'refresh_token manquant' });

    const { ok, data: tokenData } = await stravaTokenRequest({ refresh_token, grant_type: 'refresh_token' });
    if (!ok) return res.status(400).json({ error: tokenData });

    const accessToken = tokenData.access_token;
    let all = [];
    let page = 1;
    while (page <= 10) {
      const actRes = await fetch(
        `https://www.strava.com/api/v3/athlete/activities?after=${after || 0}&per_page=200&page=${page}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!actRes.ok) break;
      const batch = await actRes.json();
      if (!batch.length) break;
      all = all.concat(batch);
      if (batch.length < 200) break;
      page++;
    }

    res.json({
      activities: all,
      refresh_token: tokenData.refresh_token,
      access_token: tokenData.access_token,
      expires_at: tokenData.expires_at,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/', (req, res) => res.send('Carnet de Route API — OK'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Carnet de Route API sur le port ${PORT}`));
