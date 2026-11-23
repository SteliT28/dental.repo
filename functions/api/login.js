import {
  hashCode,
  hashToken,
  json,
  randomHex,
  sessionCookie
} from "./_middleware.js";

export async function onRequestPost({ request, env }) {
  let body;

  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const username = String(body.username || "").trim().toLowerCase();
  const code = String(body.code || "");

  if (!username || !code || code.length > 200) {
    return json({ error: "Enter your username and access code." }, 400);
  }

  const user = await env.DB.prepare(
    `SELECT id, username, display_name, code_salt, code_hash
     FROM users
     WHERE username = ? AND active = 1`
  )
    .bind(username)
    .first();

  if (!user) {
    return json({ error: "The username or access code is incorrect." }, 401);
  }

  const suppliedHash = await hashCode(code, user.code_salt);

  if (suppliedHash !== user.code_hash) {
    return json({ error: "The username or access code is incorrect." }, 401);
  }

  const token = randomHex(32);
  const tokenHash = await hashToken(token);
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + 12 * 60 * 60 * 1000
  ).toISOString();

  await env.DB.prepare(
    `INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
     VALUES (?, ?, ?, ?)`
  )
    .bind(tokenHash, user.id, expiresAt, now.toISOString())
    .run();

  return json(
    {
      user: {
        username: user.username,
        displayName: user.display_name
      }
    },
    200,
    { "Set-Cookie": sessionCookie(token) }
  );
}
