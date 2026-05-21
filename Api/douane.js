/**
 * Vercel Serverless Function — Douane.nl CORS Proxy
 * Automatisch beschikbaar op: /api/douane?commoditycode=...
 */

const TARGET = 'https://tarief.douane.nl/ite-tariff-public-proxy/ite-tariff-trusted-rs/v1/mcc/measures';

export default async function handler(req, res) {
  // CORS headers — allow any origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Build target URL with forwarded query params
  const params = new URLSearchParams(req.query).toString();
  const url    = `${TARGET}?${params}`;

  try {
    const upstream = await fetch(url, {
      headers: {
        'Accept':          'application/json',
        'Accept-Language': 'nl',
        'User-Agent':      'Mozilla/5.0',
      },
    });

    const body = await upstream.text();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(upstream.status).send(body);

  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
}
