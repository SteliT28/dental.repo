import { cqcFetch, json } from "./_middleware.js";

export async function onRequestGet({ request, env }) {
  const query = new URL(request.url).searchParams;
  const page = Math.max(1, Number(query.get("page")) || 1);
  const perPage = 25;

  const filters = {
    page,
    perPage,
    inspectionDirectorate:
      env.CQC_DENTAL_DIRECTORATE || "Primary dental services"
  };

  for (const key of ["region", "localAuthority"]) {
    const value = query.get(key);
    if (value) filters[key] = value;
  }

  try {
    const search = (query.get("q") || "").trim().toLowerCase();
    const emailFilter = query.get("email") || "";
    let result;
    let brief;

    if (search || emailFilter) {
      const firstParams = new URLSearchParams({
        ...filters,
        page: 1,
        perPage: 1000
      });

      const first = await cqcFetch(
        `locations?${firstParams.toString()}`,
        env
      );

      const pages = Number(first.totalPages) || 1;
      const batches = await Promise.all(
        Array.from({ length: Math.max(0, pages - 1) }, (_, index) => {
          const params = new URLSearchParams({
            ...filters,
            page: index + 2,
            perPage: 1000
          });

          return cqcFetch(`locations?${params.toString()}`, env);
        })
      );

      let all = [
        ...(first.locations || []),
        ...batches.flatMap((batch) => batch.locations || [])
      ];

      if (search) {
        all = all.filter((item) =>
          `${item.locationName || ""} ${item.postalCode || ""}`
            .toLowerCase()
            .includes(search)
        );
      }

      if (emailFilter) {
        const { results: saved } = await env.DB.prepare(
          "SELECT DISTINCT cqc_location_id FROM contacts"
        ).all();

        const savedIds = new Set(
          saved.map((row) => row.cqc_location_id)
        );

        all = all.filter((item) =>
          emailFilter === "has"
            ? savedIds.has(item.locationId)
            : !savedIds.has(item.locationId)
        );
      }

      result = { total: all.length };
      brief = all.slice((page - 1) * perPage, page * perPage);
    } else {
      const params = new URLSearchParams(filters);
      result = await cqcFetch(
        `locations?${params.toString()}`,
        env
      );
      brief = result.locations || [];
    }

    const practices = await Promise.all(
      brief.map(async (item) => {
        try {
          const detail = await cqcFetch(
            `locations/${encodeURIComponent(item.locationId)}`,
            env
          );

          const contacts = await env.DB.prepare(
            `SELECT id, email, role, source, note, created_by, created_at,
                    updated_by, updated_at
             FROM contacts
             WHERE cqc_location_id = ?
             ORDER BY created_at DESC`
          )
            .bind(item.locationId)
            .all();

          return {
            id: item.locationId,
            name: detail.name || item.locationName || "Unnamed practice",
            address: [
              detail.postalAddressLine1,
              detail.postalAddressLine2,
              detail.postalAddressLine3,
              detail.postalAddressTownCity,
              detail.postalCode || item.postalCode
            ]
              .filter(Boolean)
              .join(", "),
            postcode: detail.postalCode || item.postalCode || "",
            region: detail.region || "",
            localAuthority: detail.localAuthority || "",
            phone: detail.mainPhoneNumber || "",
            status: detail.registrationStatus || "",
            cqcUrl: `https://www.cqc.org.uk/location/${encodeURIComponent(item.locationId)}`,
            contacts: contacts.results || []
          };
        } catch {
          const contacts = await env.DB.prepare(
            `SELECT id, email, role, source, note, created_by, created_at,
                    updated_by, updated_at
             FROM contacts
             WHERE cqc_location_id = ?
             ORDER BY created_at DESC`
          )
            .bind(item.locationId)
            .all();

          return {
            id: item.locationId,
            name: item.locationName || "Unnamed practice",
            address: item.postalCode || "",
            postcode: item.postalCode || "",
            region: "",
            localAuthority: "",
            phone: "",
            status: "",
            cqcUrl: `https://www.cqc.org.uk/location/${encodeURIComponent(item.locationId)}`,
            contacts: contacts.results || []
          };
        }
      })
    );

    return json({
      practices,
      total: result.total || practices.length,
      page,
      perPage
    });
  } catch (error) {
    return json(
      { error: `Could not load CQC practices: ${error.message}` },
      502
    );
  }
}
