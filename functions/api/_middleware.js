const SESSION_COOKIE = "directory_session";
const SESSION_TTL_SECONDS = 12 * 60 * 60;

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  return Uint8Array.from(
    hex.match(/.{1,2}/g) || [],
    (byte) => parseInt(byte, 16)
  );
}

export function randomHex(byteLength = 16) {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function hashCode(code, saltHex) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(code),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const result = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: hexToBytes(saltHex),
      iterations: 100000,
      hash: "SHA-256"
    },
    key,
    256
  );

  return bytesToHex(new Uint8Array(result));
}

export async function hashToken(token) {
  const result = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );

  return bytesToHex(new Uint8Array(result));
}

function getCookie(request, name) {
  const cookies = request.headers.get("Cookie") || "";
  const entry = cookies
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`));

  return entry ? entry.slice(name.length + 1) : "";
}

export function sessionCookie(token) {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export async function onRequest(context) {
  const path = new URL(context.request.url).pathname;

  if (path === "/api/login" || path === "/api/setup") {
    return context.next();
  }

  const token = getCookie(context.request, SESSION_COOKIE);

  if (!token) {
    return json({ error: "Please sign in to continue." }, 401);
  }

  const tokenHash = await hashToken(token);

  const user = await context.env.DB.prepare(
    `SELECT users.id, users.username, users.display_name
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = ?
       AND sessions.expires_at > ?
       AND users.active = 1`
  )
    .bind(tokenHash, new Date().toISOString())
    .first();

  if (!user) {
    return json(
      { error: "Your session has expired. Please sign in again." },
      401
    );
  }

  context.data.user = user.username;
  context.data.userId = user.id;
  context.data.displayName = user.display_name;
  context.data.sessionHash = tokenHash;

  return context.next();
}

export const json = (body, status = 200, headers = {}) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...headers
    }
  });

export async function cqcFetch(path, env) {
  const url = new URL(
    path,
    env.CQC_API_BASE || "https://api.service.cqc.org.uk/public/v1/"
  );

  const headers = { Accept: "application/json" };

  if (env.CQC_API_HEADER_VALUE) {
    headers[env.CQC_API_HEADER_NAME || "Authorization"] =
      env.CQC_API_HEADER_VALUE;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    const errorDetails = await response.text();
    throw new Error(
      `CQC returned HTTP ${response.status}: ${errorDetails}`
    );
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
        (id, actor_email, actor_name, action, cqc_location_id,
         practice_name, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      crypto.randomUUID(),
      user,
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
