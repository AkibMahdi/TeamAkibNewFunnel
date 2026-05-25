// Vercel Function: returns the requester's approximate geo
// pulled from Vercel's edge geolocation headers (MaxMind-grade dataset).
// Public, cached briefly at the edge. No PII other than what Vercel already
// exposes via headers.
module.exports = (req, res) => {
  const decode = (v) => {
    if (!v) return '';
    try { return decodeURIComponent(v); } catch (_) { return String(v); }
  };

  const city = decode(req.headers['x-vercel-ip-city']);
  const region = decode(req.headers['x-vercel-ip-country-region']);
  const country = (req.headers['x-vercel-ip-country'] || '').toString();
  const lat = (req.headers['x-vercel-ip-latitude'] || '').toString();
  const lon = (req.headers['x-vercel-ip-longitude'] || '').toString();

  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
  res.setHeader('Content-Type', 'application/json');
  res.status(200).send(JSON.stringify({ city, region, country, lat, lon }));
};
