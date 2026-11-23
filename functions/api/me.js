import { hashCode, json, randomHex } from "./_middleware.js";

export async function onRequestGet({ data }) {
  return json({
    user: {
      username: data.user,
      displayName: data.displayName
    }
  });
}

export async function onRequestPut({ request, env, data }) {
  let body;

  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const displayName = String(body.displayName || "").trim();

  if (!displayName || displayName.length > 60) {
    return json(
      { error: "Enter a name of 1 to 60 characters." },
      400
    );
  }

  const now = new Date().toISOString();

  if (body.newCode) {
    const currentCode = String(body.currentCode || "");
    const newCode = String(body.newCode);

    if (newCode.length < 8 || newCode.length > 200) {
      return json(
        { error: "The new access code must be at least 8 characters." },
        400
      );
    }

    const account = await env.DB.prepare(
      "SELECT code_salt, code_hash FROM users WHERE id = ?"
    )
      .bind(data.userId)
      .first();

    if (!account) {
      return json({ error: "Account not found." }, 404);
    }

    const currentHash = await hashCode(currentCode, account.code_salt);

    if (currentHash !== account.code_hash) {
      return json({ error: "Your current access code is incorrect." }, 401);
    }

    const salt = randomHex(16);
    const codeHash = await hashCode(newCode, salt);

    await env.DB.prepare(
      `UPDATE users
       SET display_name = ?, code_salt = ?, code_hash = ?, updated_at = ?
       WHERE id = ?`
    )
      .bind(displayName, salt, codeHash, now, data.userId)
      .run();
  } else {
    await env.DB.prepare(
      `UPDATE users
       SET display_name = ?, updated_at = ?
       WHERE id = ?`
    )
      .bind(displayName, now, data.userId)
      .run();
  }

  return json({
    user: {
      username: data.user,
      displayName
    }
  });
}
