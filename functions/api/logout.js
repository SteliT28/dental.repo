import { clearSessionCookie, json } from "./_middleware.js";

export async function onRequestPost({ env, data }) {
  if (data.sessionHash) {
    await env.DB.prepare(
      "DELETE FROM sessions WHERE token_hash = ?"
    )
      .bind(data.sessionHash)
      .run();
  }

  return json(
    { ok: true },
    200,
    { "Set-Cookie": clearSessionCookie() }
  );
}
