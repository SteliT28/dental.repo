import { json, logActivity, validEmail } from "../_middleware.js";

export async function onRequestPut({ request, env, data, params }) {
  let body;

  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }

  if (!body.email || !body.role || !body.source || !validEmail(body.email)) {
    return json(
      { error: "A valid email, role and source are required." },
      400
    );
  }

  const existing = await env.DB.prepare(
    "SELECT * FROM contacts WHERE id = ?"
  )
    .bind(params.id)
    .first();

  if (!existing) {
    return json({ error: "Contact not found." }, 404);
  }

  const email = body.email.trim().toLowerCase();
  const role = body.role.trim();
  const source = body.source.trim();
  const note = String(body.note || "").trim();
  const now = new Date().toISOString();

  await env.DB.prepare(
    `UPDATE contacts
     SET email = ?, role = ?, source = ?, note = ?, updated_by = ?, updated_at = ?
     WHERE id = ?`
  )
    .bind(email, role, source, note, data.user, now, params.id)
    .run();

  await logActivity(
    env.DB,
    data.user,
    "updated contact",
    existing.cqc_location_id,
    existing.practice_name,
    `${role} · ${email}`
  );

  return json({ ok: true });
}

export async function onRequestDelete({ env, data, params }) {
  const existing = await env.DB.prepare(
    "SELECT * FROM contacts WHERE id = ?"
  )
    .bind(params.id)
    .first();

  if (!existing) {
    return json({ error: "Contact not found." }, 404);
  }

  await env.DB.prepare("DELETE FROM contacts WHERE id = ?")
    .bind(params.id)
    .run();

  await logActivity(
    env.DB,
    data.user,
    "removed contact",
    existing.cqc_location_id,
    existing.practice_name,
    `${existing.role} · ${existing.email}`
  );

  return json({ ok: true });
}
