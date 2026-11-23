import { json } from "./_middleware.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const limit = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get("limit")) || 20)
  );

  const { results } = await env.DB.prepare(
    `SELECT actor_email, action, cqc_location_id, practice_name, details, created_at
     FROM activity
     ORDER BY created_at DESC
     LIMIT ?`
  )
    .bind(limit)
    .all();

  return json({ activity: results });
}
