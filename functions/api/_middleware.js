export async function cqcFetch(path, env) {
  const url = new URL(
    path,
    env.CQC_API_BASE || "https://api.service.cqc.org.uk/public/v1/"
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
    const errorDetails = await response.text();
    throw new Error(
      `CQC returned HTTP ${response.status}: ${errorDetails}`
    );
  }

  return response.json();
}
