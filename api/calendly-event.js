// Vercel Function: fetches Calendly scheduled-event + invitee details for
// the post-booking thank-you page so we can show the actual call time
// and confirm the invitee's name/email after an embedded booking.
//
// Required env var: CALENDLY_TOKEN  (Calendly Personal Access Token).
// Token is read server-side only — never exposed to the browser.
//
// Usage:
//   GET /api/calendly-event?event_uuid=AAAA[&invitee_uuid=BBBB]
//   GET /api/calendly-event?event_type_uuid=AAAA[&invitee_uuid=BBBB]  (legacy)
//
// Returns:
//   { event:   { start_time, end_time, name, location, status } | null,
//     invitee: { name, email, status, timezone }                 | null }
//
// Cached for 5 minutes at the edge — the booking details don't change once
// scheduled, so repeat hits on the thank-you page reuse the same response.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function calendlyGet(url, token) {
  const res = await fetch(url, {
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    return { ok: false, status: res.status };
  }
  const body = await res.json();
  return { ok: true, data: body && body.resource ? body.resource : body };
}

module.exports = async (req, res) => {
  const q = (req.query && typeof req.query === 'object') ? req.query : {};
  const eventUuid = String(q.event_uuid || q.event_type_uuid || '').trim();
  const inviteeUuid = String(q.invitee_uuid || q.invitee || '').trim();

  if (!eventUuid || !UUID_RE.test(eventUuid)) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'invalid_event_uuid' }));
    return;
  }

  const token = process.env.CALENDLY_TOKEN;
  if (!token) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'calendly_token_not_configured' }));
    return;
  }

  try {
    const eventUrl = 'https://api.calendly.com/scheduled_events/' + encodeURIComponent(eventUuid);
    const inviteeUrl = inviteeUuid && UUID_RE.test(inviteeUuid)
      ? eventUrl + '/invitees/' + encodeURIComponent(inviteeUuid)
      : null;

    const [eventRes, inviteeRes] = await Promise.all([
      calendlyGet(eventUrl, token),
      inviteeUrl ? calendlyGet(inviteeUrl, token) : Promise.resolve(null),
    ]);

    if (!eventRes.ok) {
      res.statusCode = eventRes.status === 404 ? 404 : 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'calendly_event_unavailable' }));
      return;
    }

    const evt = eventRes.data || {};
    const inv = (inviteeRes && inviteeRes.ok) ? (inviteeRes.data || {}) : null;

    /* Strip location to the meeting *type* only — never echo back the
       Zoom/Meet join URL, password, dial-in numbers, etc. through a
       public endpoint, even one gated by hard-to-guess UUIDs. The
       invitee already received the full join details directly from
       Calendly via their calendar invite. */
    var locationType = null;
    if (evt.location && typeof evt.location === 'object' && evt.location.type) {
      locationType = String(evt.location.type);
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    res.end(JSON.stringify({
      event: {
        start_time:    evt.start_time || null,
        end_time:      evt.end_time   || null,
        name:          evt.name       || null,
        status:        evt.status     || null,
        location_type: locationType,
      },
      invitee: inv ? {
        name:     inv.name     || null,
        status:   inv.status   || null,
        timezone: inv.timezone || null,
      } : null,
    }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'fetch_failed' }));
  }
};
