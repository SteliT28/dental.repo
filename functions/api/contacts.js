import { json, logActivity, validEmail } from "./_middleware.js";

export async function onRequestGet({ request, env }) {
  const id = new URL(request.url).searchParams.get("locationId");

  if (!id) {
    return json({ error: "locationId is required." }, 400);
  }

  const { results } = await env.DB.prepare(
    `SELECT *
     FROM contacts
     WHERE cqc_location_id = ?
     ORDER BY created_at DESC`
  )
    .bind(id)
    .all();

  return json({ contacts: results });
}

export async function onRequestPost({ request, env, data }) {
  let body;

  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }

  const fields = ["locationId", "practiceName", "email", "role", "source"];

  if (
    fields.some(
      (key) => typeof body[key] !== "string" || !body[key].trim()
    )
  ) {
    return json(
      { error: "Practice, email, role and source are required." },
      400
    );
  }

  if (!validEmail(body.email)) {
    return json({ error: "Enter a valid email address." }, 400);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const email = body.email.trim().toLowerCase();
  const role = body.role.trim();
  const source = body.source.trim();
  const note = String(body.note || "").trim();
  const locationId = body.locationId.trim();
  const practiceName = body.practiceName.trim();

  await env.DB.prepare(
    `INSERT INTO contacts
      (id, cqc_location_id, practice_name, email, role, source, note,
       created_by, created_at, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      locationId,
      practiceName,
      email,
      role,
      source,
      note,
      data.user,
      now,
      data.user,
      now
    )
    .run();

  await logActivity(
    env.DB,
    data.user,
    "added contact",
    locationId,
    practiceName,
    `${role} · ${email} · ${source}`
  );

  return json(
    {
      contact: {
        id,
        cqc_location_id: locationId,
        practice_name: practiceName,
        email,
        role,
        source,
        note,
        created_by: data.user,
        created_at: now
      }
    },
    201
  );
}
