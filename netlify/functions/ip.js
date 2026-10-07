// ip-check-proxy: free multi-source IP geolocation endpoint.
// Lives at https://<your-site>/.netlify/functions/ip (or /api/ip via redirect).
// Info.madmaxlax.com calls this instead of hitting ip-api.com directly,
// because ip-api.com's free tier blocks HTTPS and dies on HTTPS pages.
//
// Sources (all free, no key required), tried in order:
//   1. ip-api.com over plain HTTP (free, no key, ~45 req/min per IP)
//   2. ipwho.is over HTTPS (free 10k/mo, no key)
//   3. ipapi.co over HTTPS (free 30k/mo, no key)
//
// The client IP comes from Netlify's x-nf-client-connection-ip header,
// so it is accurate without relying on any upstream API's guess.

const TIMEOUT_MS = 4000;

function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

function clientIp(event) {
  const headers = event.headers || {};
  // Netlify sets this to the real client IP. Trust it first.
  const nf = headers["x-nf-client-connection-ip"] || headers["X-Nf-Client-Connection-Ip"];
  if (nf) return nf.trim();
  const xff = headers["x-forwarded-for"] || headers["X-Forwarded-For"];
  if (xff) return xff.split(",")[0].trim();
  return "";
}

async function fetchJson(url) {
  const { signal, done } = withTimeout(TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal, headers: { "User-Agent": "ip-check-proxy/1.0" } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    done();
  }
}

// Each source maps its own shape to the shared output shape.
async function fromIpApi(ip) {
  const data = await fetchJson(
    `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,query,country,countryCode,regionName,city,isp,org,timezone`
  );
  if (!data || data.status !== "success") return null;
  return {
    ok: true,
    ip: data.query,
    country: data.country,
    countryCode: data.countryCode,
    region: data.regionName,
    city: data.city,
    isp: data.isp,
    org: data.org,
    timezone: data.timezone,
    source: "ip-api.com",
  };
}

async function fromIpWhoIs(ip) {
  const data = await fetchJson(`https://ipwho.is/${encodeURIComponent(ip)}`);
  if (!data || data.success === false) return null;
  return {
    ok: true,
    ip: data.ip,
    country: data.country,
    countryCode: data.country_code,
    region: data.region,
    city: data.city,
    isp: data.connection ? data.connection.isp : "",
    org: data.connection ? data.connection.org : "",
    timezone: data.timezone ? data.timezone.id : "",
    source: "ipwho.is",
  };
}

async function fromIpApiCo(ip) {
  const data = await fetchJson(`https://ipapi.co/${encodeURIComponent(ip)}/json/`);
  if (!data || data.error) return null;
  return {
    ok: true,
    ip: data.ip,
    country: data.country_name,
    countryCode: data.country_code,
    region: data.region,
    city: data.city,
    isp: "",
    org: data.org,
    timezone: data.timezone,
    source: "ipapi.co",
  };
}

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  const ip = clientIp(event);
  if (!ip) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: "no-client-ip" }) };
  }

  const sources = [fromIpApi, fromIpWhoIs, fromIpApiCo];
  for (const source of sources) {
    const result = await source(ip);
    if (result) {
      return { statusCode: 200, headers, body: JSON.stringify(result) };
    }
  }

  return {
    statusCode: 502,
    headers,
    body: JSON.stringify({ ok: false, error: "all-sources-failed", ip }),
  };
};
