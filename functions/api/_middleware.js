let cachedKeys;
let cachedKeysUntil = 0;

function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function decodePart(value) {
  return JSON.parse(
    new TextDecoder().decode(base64UrlToBytes(value))
  );
}

async function authenticate(request, env) {
  const team = (env.ACCESS_TEAM_DOMAIN || "")
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  const audience = env.ACCESS_AUD || "";
  const allowlist = (env.TEAM_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (!team || !audience || allowlist.length !== 4) {
    return {
      error: "Team access is not configured. Set ACCESS_TEAM_DOMAIN, ACCESS_AUD and four TEAM_EMAILS."
    };
  }

  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) {
    return {
      error: "Sign in through the team access page to continue.",
      status: 401
    };
  }

  const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    return { error: "Invalid sign-in token.", status: 401 };
  }

  let header;
  let payload;

  try {
    header = decodePart(encodedHeader);
    payload = decodePart(encodedPayload);
  } catch {
    return { error: "Invalid sign-in token.", status: 401 };
  }

  if (header.alg !== "RS256" || !header.kid) {
    return { error: "Unsupported sign-in token.", status: 401 };
  }

  const issuer = `https://${team}`;
  const audienceMatches = Array.isArray(payload.aud)
    ? payload.aud.includes(audience)
    : payload.aud === audience;

  if (
    payload.iss !== issuer ||
    !audienceMatches ||
    !payload.email ||
    !Number.isFinite(payload.exp) ||
    payload.exp < Date.now() / 1000
  ) {
    return {
      error: "Sign-in token is expired or does not match this app.",
      status: 401
    };
  }

  const email = String(payload.email).toLowerCase();
  if (!allowlist.includes(email)) {
    return {
      error: "This account is not on the team access list.",
      status: 403
    };
  }

  let keys = Date.now() < cachedKeysUntil ? cachedKeys : null;
  if (!keys) {
    keys = await env.ACCESS_KEYS?.get("jwks", "json");
  }

  if (!keys) {
    const response = await fetch(`${issuer}/cdn-cgi/access/certs`);
    if (!response.ok) {
      return { error: "Could not verify team sign-in.", status: 503 };
    }

    keys = await response.json();
    await env.ACCESS_KEYS?.put("jwks", JSON.stringify(keys), {
      expirationTtl: 3600
    });
    cachedKeys = keys;
    cachedKeysUntil = Date.now() + 3600 * 1000;
  }

  const jwk = (keys.keys || []).find((key) => key.kid === header.kid);
  if (!jwk) {
    return { error: "Sign-in key not recognised.", status: 401 };
  }

  try {
    const publicKey = await crypto.subtle.importKey(
      "jwk",
      jwk,
      {
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-256"
      },
      false,
      ["verify"]
    );

    const signedData = new TextEncoder().encode(
      `${encodedHeader}.${encodedPayload}`
    );

    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      base64UrlToBytes(encodedSignature),
      signedData
    );

    if (!valid) {
      return {
        error: "Sign-in token could not be verified.",
        status: 401
      };
    }
  } catch {
    return {
      error: "Sign-in token could not be verified.",
      status: 401
    };
  }

  return { email };
}

export async function onRequest(context) {
  const identity = await authenticate(context.request, context.env);

  if (identity.error) {
    return Response.json(
      { error: identity.error },
      {
        status: identity.status || 503,
        headers: { "Cache-Control": "no-store" }
      }
    );
  }

  context.data.user = identity.email;
  return context.next();
}

export const json = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" }
  });

export async function cqcFetch(path, env) {
  const url = new URL(
    path,
    env.CQC_API_BASE || "https://api.cqc.org.uk/public/v1/"
  );

  url.searchParams.set(
    "partnerCode",
    env.CQC_PARTNER_CODE || "DentalPracticeDirectory"
  );

  const headers = { Accept: "application/json" };

  if (env.CQC_API_HEADER_VALUE) {
    headers[env.CQC_API_HEADER_NAME || "Authorization"] =
      env.CQC_API_HEADER_VALUE;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`CQC returned HTTP ${response.status}`);
  }

  return response.json();
}

export async function logActivity(
  db,
  user,
  action,
  locationId,
  practiceName,
  details = ""
) {
  await db
    .prepare(
      `INSERT INTO activity
        (id, actor_email, action, cqc_location_id, practice_name, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      crypto.randomUUID(),
      user,
      action,
      locationId,
      practiceName,
      details,
      new Date().toISOString()
    )
    .run();
}

export const validEmail = (value) =>
  typeof value === "string" &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
