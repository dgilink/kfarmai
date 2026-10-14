import "@supabase/functions-js/edge-runtime.d.ts";

const TOKEN = /^[A-Za-z0-9_-]{32,256}$/;
const SHA = /^[a-f0-9]{64}$/;
const cookieName = "kfarmai_review_csrf";

function headers(extra: HeadersInit = {}) {
  return new Headers({"Cache-Control":"no-store","Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff",...extra});
}
function escape(value: unknown) { return String(value ?? "").replace(/[&<>'"]/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]!)); }
function b64url(bytes: ArrayBuffer) { return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll("+","-").replaceAll("/","_").replaceAll("=",""); }
async function sha256(value: string) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))).map((item)=>item.toString(16).padStart(2,"0")).join(""); }
async function csrf(token: string) {
  const secret=Deno.env.get("DAILY_REVIEW_APPROVAL_CSRF_SECRET")||"";
  if(secret.length<32) throw new Error("SERVER_NOT_CONFIGURED");
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return b64url(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(`daily-review:${token}`)));
}
function readCookie(request: Request, name: string) { const prefix=`${name}=`; return (request.headers.get("cookie")||"").split(";").map((part)=>part.trim()).find((part)=>part.startsWith(prefix))?.slice(prefix.length)||""; }
async function rpc(functionName: string, payload: Record<string, unknown>) {
  const url=Deno.env.get("SUPABASE_URL")||"", service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!url||!service) throw new Error("SERVER_NOT_CONFIGURED");
  const response=await fetch(`${url}/rest/v1/rpc/${functionName}`,{method:"POST",headers:{apikey:service,authorization:`Bearer ${service}`,"Content-Type":"application/json"},body:JSON.stringify(payload)});
  if(!response.ok) throw new Error("APPROVAL_NOT_AVAILABLE");
  return await response.json();
}
function html(review: Record<string, unknown>, token: string, csrfValue: string) {
  const action=review.approval_type==="CONTENT"?"CONTENT_APPROVE":"PUBLISH_APPROVE";
  const sources=Array.isArray(review.official_sources)?review.official_sources.map((item)=>`<li>${escape(typeof item==="object"?JSON.stringify(item):item)}</li>`).join(""):"";
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KFarmAI REVIEW</title><style>body{font:16px system-ui;max-width:720px;margin:32px auto;padding:0 16px;color:#19351f}article{border:1px solid #d4e2d1;border-radius:16px;padding:24px}small{color:#526556}button{background:#176b3a;color:#fff;border:0;border-radius:8px;padding:12px 16px;font-weight:700}</style><article><p>REVIEW 전용 · published=false</p><h1>${escape(review.title)}</h1><p>${escape(review.summary)}</p><h2>공식 출처</h2><ul>${sources||"<li>검수 패키지의 공식 출처를 확인하세요.</li>"}</ul><h2>실제 AI usage·비용</h2><pre>${escape(JSON.stringify(review.usage||{}))}</pre><p>Artifact ID: ${escape(review.artifact_id)}<br>Manifest: ${escape(review.manifest_sha256)}<br>상태: ${escape(review.state)}<br>만료: ${escape(review.expires_at)}</p><p><a rel="noreferrer" href="${escape(review.review_url)}">GitHub REVIEW Issue</a></p><form method="post"><input type="hidden" name="token" value="${escape(token)}"><input type="hidden" name="csrf" value="${escape(csrfValue)}"><input type="hidden" name="manifest_sha256" value="${escape(review.manifest_sha256)}"><input type="hidden" name="action" value="${action}"><button type="submit">${action==="CONTENT_APPROVE"?"콘텐츠 검수 승인":"공개 승인"}</button></form></article></html>`;
}

Deno.serve(async (request) => {
  try {
    if(request.method==="GET") {
      const token=new URL(request.url).searchParams.get("token")||"";
      if(!TOKEN.test(token)) return new Response("not found",{status:404,headers:headers()});
      const review=await rpc("daily_review_approval_review",{p_token:token}) as Record<string,unknown>;
      const value=await csrf(token), responseHeaders=headers({"Content-Type":"text/html; charset=utf-8"});
      responseHeaders.append("Set-Cookie",`${cookieName}=${value}; Path=/functions/v1/daily-review-approval; HttpOnly; Secure; SameSite=Strict; Max-Age=900`);
      return new Response(html(review,token,value),{headers:responseHeaders});
    }
    if(request.method!=="POST") return new Response("method not allowed",{status:405,headers:headers({Allow:"GET, POST"})});
    const form=await request.formData(), token=String(form.get("token")||""), csrfValue=String(form.get("csrf")||""), action=String(form.get("action")||""), manifest=String(form.get("manifest_sha256")||"");
    if(!TOKEN.test(token)||!SHA.test(manifest)||!["CONTENT_APPROVE","PUBLISH_APPROVE"].includes(action)||csrfValue!==readCookie(request,cookieName)||csrfValue!==await csrf(token)) return new Response("approval blocked",{status:403,headers:headers()});
    const result=await rpc("daily_review_approval_apply",{p_token:token,p_action:action,p_manifest_sha256:manifest,p_request_fingerprint:await sha256(`${action}:${manifest}:${csrfValue}`)}) as Record<string,unknown>;
    return new Response(`<!doctype html><meta charset="utf-8"><title>KFarmAI REVIEW</title><p>승인 상태: ${escape(result.state)}</p><p>공개는 기존 Gate C/D의 stale-main·artifact 검증을 통과할 때만 진행됩니다.</p>`,{headers:headers({"Content-Type":"text/html; charset=utf-8"})});
  } catch (_error) { return new Response("approval unavailable",{status:503,headers:headers()}); }
});
