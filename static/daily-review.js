(() => {
  "use strict";
  const endpoint = "https://xzetqijeucldbfgjuoes.supabase.co/functions/v1/daily-review-approval";
  const token = new URLSearchParams(location.search).get("token") || "";
  const byId = (id) => document.getElementById(id);
  const fail = () => {
    byId("review-card").setAttribute("aria-busy", "false");
    byId("review-title").textContent = "검수 링크를 확인할 수 없습니다";
    byId("review-content").hidden = true;
    byId("review-error").hidden = false;
  };
  if (!/^[A-Za-z0-9_-]{32,255}$/.test(token)) return fail();
  fetch(`${endpoint}?token=${encodeURIComponent(token)}&format=json`, { credentials: "include", cache: "no-store" })
    .then((response) => {
      if (!response.ok || !(response.headers.get("content-type") || "").startsWith("application/json")) throw new Error("review unavailable");
      return response.json();
    })
    .then((review) => {
      byId("review-title").textContent = String(review.title || "KFarmAI REVIEW");
      byId("review-summary").textContent = String(review.summary || "");
      const sources = Array.isArray(review.official_sources) ? review.official_sources : [];
      for (const source of sources) {
        const item = document.createElement("li");
        item.textContent = typeof source === "object" ? JSON.stringify(source) : String(source);
        byId("review-sources").append(item);
      }
      byId("review-usage").textContent = JSON.stringify(review.usage || {}, null, 2);
      byId("review-binding").textContent = `Artifact ID: ${review.artifact_id}\nManifest: ${review.manifest_sha256}\n상태: ${review.state}\n만료: ${review.expires_at}`;
      byId("review-issue").href = String(review.review_url || "https://github.com/dgilink/kfarmai/issues/5");
      byId("review-form").action = String(review.review_endpoint || endpoint);
      byId("review-token").value = token;
      byId("review-csrf").value = String(review.csrf || "");
      byId("review-manifest").value = String(review.manifest_sha256 || "");
      byId("review-action").value = String(review.action || "");
      const button = byId("review-button");
      button.textContent = review.action === "CONTENT_APPROVE" ? "콘텐츠 검수 승인" : "공개 승인";
      button.disabled = false;
      byId("review-content").hidden = false;
      byId("review-card").setAttribute("aria-busy", "false");
    })
    .catch(fail);
})();
