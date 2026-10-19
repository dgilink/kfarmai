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
  const imageReady = (image) => new Promise((resolve, reject) => {
    image.addEventListener("load", () => image.naturalWidth > 0 ? resolve() : reject(new Error("empty image")), { once: true });
    image.addEventListener("error", reject, { once: true });
  });
  fetch(`${endpoint}?token=${encodeURIComponent(token)}&format=json`, { credentials: "include", cache: "no-store" })
    .then((response) => {
      if (!response.ok || !(response.headers.get("content-type") || "").startsWith("application/json")) throw new Error("review unavailable");
      return response.json();
    })
    .then((review) => {
      const article = review.article && typeof review.article === "object" ? review.article : {};
      const reviewMeta = review.review && typeof review.review === "object" ? review.review : {};
      const sourceCheck = review.source_check && typeof review.source_check === "object" ? review.source_check : {};
      byId("review-title").textContent = String(article.title || "KFarmAI REVIEW");
      byId("review-summary").textContent = String(article.summary || "");
      byId("review-reason").textContent = String(reviewMeta.reason || "");
      byId("review-checked-at").textContent = String(sourceCheck.checked_at || "");
      const sections = Array.isArray(article.sections) ? article.sections : [];
      for (const section of sections) {
        const heading = document.createElement("h3");
        const paragraph = document.createElement("p");
        heading.textContent = String(section && section.heading || "확인 포인트");
        paragraph.textContent = String(section && section.body || "");
        byId("review-sections").append(heading, paragraph);
      }
      byId("review-connection").textContent = String(article.kfarmai_connection || "");
      byId("review-safety").textContent = String(article.safety_note || "");
      const sources = Array.isArray(article.sources) ? article.sources : [];
      for (const source of sources) {
        const item = document.createElement("li");
        const link = document.createElement("a");
        const claim = document.createElement("p");
        link.href = String(source && source.url || "");
        link.textContent = String(source && source.title || "공식 출처");
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        claim.textContent = String(source && source.claim || "");
        item.append(link, claim);
        byId("review-sources").append(item);
      }
      const media = sourceCheck.media && typeof sourceCheck.media === "object" ? sourceCheck.media : {};
      byId("review-classification").textContent = `본문은 AI·편집 참고자료이며 공식자료 원문을 대체하지 않습니다. Hero는 ${String(media.author || "확인된 공식 출처")}의 ${String(media.license || "출처 확인 이미지")}를 사용했고, Infographic은 승인 대상 본문 데이터로 결정론적으로 생성된 SVG입니다.`;
      const evidence = sourceCheck.cost_evidence && typeof sourceCheck.cost_evidence === "object" ? sourceCheck.cost_evidence : {};
      const usage = evidence.usage && typeof evidence.usage === "object" ? evidence.usage : review.usage || {};
      const reasoning = usage.output_tokens_details && typeof usage.output_tokens_details === "object" ? usage.output_tokens_details.reasoning_tokens : null;
      byId("review-usage").textContent = `Model: ${evidence.model || ""}\nInput: ${usage.input_tokens ?? ""}\nOutput: ${usage.output_tokens ?? ""}\nReasoning: ${reasoning ?? ""}\n실제 비용: ${evidence.estimated_microusd ?? ""} micro-USD`;
      byId("review-binding").textContent = `Artifact ID: ${review.artifact_id}\nManifest SHA: ${review.manifest_sha256}\nArticle SHA: ${review.article_sha256}\nHTML SHA: ${review.html_sha256}\nHero SHA: ${review.hero_sha256}\nInfographic SHA: ${review.infographic_sha256}\n상태: ${review.state}\n만료: ${review.expires_at}\npublished=false`;
      byId("review-issue").href = String(review.review_url || "https://github.com/dgilink/kfarmai/issues/5");
      byId("review-form").action = String(review.review_endpoint || endpoint);
      byId("review-token").value = token;
      byId("review-csrf").value = String(review.csrf || "");
      byId("review-manifest").value = String(review.manifest_sha256 || "");
      byId("review-action").value = String(review.action || "");
      const button = byId("review-button");
      button.textContent = review.action === "CONTENT_APPROVE" ? "콘텐츠 검수 승인" : "공개 승인";
      const hero = byId("review-hero");
      const infographic = byId("review-infographic");
      const images = [imageReady(hero), imageReady(infographic)];
      hero.src = String(review.hero_url || "");
      infographic.src = String(review.infographic_url || "");
      byId("review-content").hidden = false;
      byId("review-card").setAttribute("aria-busy", "false");
      return Promise.all(images).then(() => { button.disabled = false; });
    })
    .catch(fail);
})();
