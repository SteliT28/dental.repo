import { hashCode, json, randomHex } from "./_middleware.js";

export async function onRequestPost({ request, env }) {
  if (!env.SETUP_SECRET) {
    return json({ error: "Account setup is not configured." }, 503);
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  if (body.setupSecret !== env.SETUP_SECRET) {
    return json({ error: "Setup code is incorrect." }, 403);
  }

  const existing = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM users"
  ).first();

  if (existing?.count > 0) {
    return json({ error: "The four accounts have already been created." }, 409);
  }

  if (!Array.isArray(body.accounts) || body.accounts.length !== 4) {
    return json({ error: "Enter exactly four accounts." }, 400);
  }

  const usernames = new Set();

  for (const account of body.accounts) {
    const username = String(account.username || "").trim().toLowerCase();
    const displayName = String(account.displayName || "").trim();
    const code = String(account.code || "");

    if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
      return json(
        { error: "Usernames must be 3–30 letters, numbers, dots, underscores or hyphens." },
        400
      );
    }

    if (usernames.has(username)) {
      return json({ error: "Each username must be different." }, 400);
    }

    if (!displayName || displayName.length > 60) {
      return json(
        { error: "Each account needs a name of 1 to 60 characters." },
        400
      );
    }

    if (code.length < 8 || code.length > 200) {
      return json(
        { error: "Each access code must be at least 8 characters." },
        400
      );
    }

    usernames.add(username);
  }

  const now = new Date().toISOString();
  const preparedAccounts = await Promise.all(
    body.accounts.map(async (account) => {
      const salt = randomHex(16);

      return {
        id: crypto.randomUUID(),
        username: String(account.username).trim().toLowerCase(),
        displayName: String(account.displayName).trim(),
        salt,
        codeHash: await hashCode(String(account.code), salt)
      };
    })
  );

  await env.DB.batch(
    preparedAccounts.map((account) =>
      env.DB.prepare(
        `INSERT INTO users
          (id, username, display_name, code_salt, code_hash, active,
           created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
      ).bind(
        account.id,
        account.username,
        account.displayName,
        account.salt,
        account.codeHash,
        now,
        now
      )
    )
  );

  return json({
    ok: true,
    accounts: preparedAccounts.map(({ username, displayName }) => ({
      username,
      displayName
    }))
  }, 201);
}
