"""Disposable local-only Auth/PostgREST RLS smoke; never connects to production."""
import json
import re
import secrets
import shutil
import subprocess
import base64
import urllib.error
import urllib.parse
import urllib.request


cli = shutil.which("supabase.exe") or shutil.which("supabase.cmd") or shutil.which("supabase")
if not cli:
    raise RuntimeError("LOCAL_SUPABASE_CLI_MISSING")
raw = subprocess.run([cli, "status", "--output", "json"], capture_output=True,
                     text=True, check=True).stdout


def setting(name):
    match = re.search(r'^\s*"' + re.escape(name) + r'"\s*:\s*"([^"]+)"', raw, re.M)
    if not match:
        raise RuntimeError("LOCAL_SUPABASE_STATUS_MISSING_" + name)
    return match.group(1)


api = setting("API_URL").rstrip("/")
if not re.fullmatch(r"http://127\.0\.0\.1:\d+", api):
    raise RuntimeError("LOCAL_ONLY_API_REQUIRED")
anon_key = setting("ANON_KEY")


def request(path, method="GET", payload=None, token=None, prefer=None):
    headers = {"apikey": anon_key}
    if token:
        headers["Authorization"] = "Bearer " + token
    if prefer:
        headers["Prefer"] = prefer
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(api + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            body = response.read()
            return response.status, json.loads(body) if body else None
    except urllib.error.HTTPError as error:
        body = error.read()
        return error.code, json.loads(body) if body else None


def member(label):
    nonce = secrets.token_hex(8)
    email = f"phase7-{label}-{nonce}@example.test"
    password = secrets.token_urlsafe(24)
    status, result = request("/auth/v1/signup", "POST", {"email": email, "password": password})
    if status not in (200, 201) or not result.get("user", {}).get("id"):
        raise RuntimeError(f"LOCAL_SIGNUP_{label}_{status}")
    status, login = request("/auth/v1/token?grant_type=password", "POST",
                            {"email": email, "password": password})
    if status != 200 or not login.get("access_token"):
        raise RuntimeError(f"LOCAL_LOGIN_{label}_{status}")
    return result["user"]["id"], login["access_token"]


a_id, a_token = member("a")
b_id, b_token = member("b")
status, rows = request("/rest/v1/posts", "POST",
                       {"user_id": a_id, "title": "Phase 7 local fixture",
                        "content": "Local RLS-only fixture"}, a_token,
                       "return=representation")
if status != 201 or not rows or rows[0].get("user_id") != a_id:
    raise RuntimeError(f"LOCAL_POST_CREATE_{status}")
post_id = rows[0]["id"]


def require_empty(status, rows, label):
    if status not in (200, 204) or rows not in ([], None):
        raise RuntimeError(f"LOCAL_RLS_{label}_{status}")


try:
    status, rows = request(f"/rest/v1/posts?id=eq.{post_id}", "PATCH",
                           {"title": "forbidden"}, b_token, "return=representation")
    require_empty(status, rows, "OTHER_POST_UPDATE")
    status, rows = request(f"/rest/v1/posts?id=eq.{post_id}", "DELETE",
                           token=b_token, prefer="return=representation")
    require_empty(status, rows, "OTHER_POST_DELETE")
    status, rows = request("/rest/v1/posts", "POST",
                           {"user_id": a_id, "title": "anonymous write",
                            "content": "blocked"}, prefer="return=representation")
    if status not in (401, 403):
        raise RuntimeError(f"LOCAL_ANON_WRITE_{status}")
    status, rows = request("/rest/v1/comments", "POST",
                           {"post_id": post_id, "user_id": b_id,
                            "content": "B local comment", "is_secret": True},
                           b_token, "return=representation")
    if status != 201 or not rows:
        raise RuntimeError(f"LOCAL_COMMENT_CREATE_{status}")
    comment_id = rows[0]["id"]
    status, rows = request(f"/rest/v1/comments?id=eq.{comment_id}", "DELETE",
                           token=a_token, prefer="return=representation")
    require_empty(status, rows, "OTHER_COMMENT_DELETE")
    status, rows = request(f"/rest/v1/comments?id=eq.{comment_id}&select=id")
    require_empty(status, rows, "ANON_SECRET_COMMENT_READ")
    status, rows = request(f"/rest/v1/comments?id=eq.{comment_id}", "DELETE",
                           token=b_token, prefer="return=representation")
    if status not in (200, 204) or not rows:
        raise RuntimeError(f"LOCAL_OWN_COMMENT_DELETE_{status}")
    print("LOCAL_AUTH_RLS_E2E=PASS members=2 post=1 comment=1")
finally:
    status, rows = request(f"/rest/v1/posts?id=eq.{post_id}", "DELETE",
                           token=a_token, prefer="return=representation")
    if status not in (200, 204) or not rows:
        raise RuntimeError("LOCAL_FIXTURE_CLEANUP_FAILED")

def storage_request(path, method="GET", payload=None, token=None, content_type=None, upsert=False):
    headers = {"apikey": anon_key, "Authorization": "Bearer " + (token or anon_key)}
    if content_type:
        headers["Content-Type"] = content_type
    if upsert:
        headers["x-upsert"] = "true"
    req = urllib.request.Request(api + path, data=payload, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


def denied(status, label):
    if status not in (400, 401, 403, 404, 413, 415):
        raise RuntimeError(f"LOCAL_STORAGE_{label}_{status}")


image = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL2oQAAAABJRU5ErkJggg=="
)
path = f"{a_id}/draft-{secrets.token_hex(8)}/photo.png"
object_url = "/storage/v1/object/post-images/" + path
public_url = "/storage/v1/object/public/post-images/" + path
status, _ = storage_request(object_url, "POST", image, a_token, "image/png")
denied(status, "DIRECT_OWN_UPLOAD")
status, _ = storage_request(public_url)
denied(status, "UNCREATED_PUBLIC_URL")
status, _ = storage_request(object_url, "POST", image, b_token, "image/png")
denied(status, "SPOOFED_OWNER_UPLOAD")
status, _ = storage_request(object_url, "PUT", image, b_token, "image/png", upsert=True)
denied(status, "OTHER_UPDATE")
status, _ = storage_request(object_url, "DELETE", token=b_token)
denied(status, "OTHER_DELETE")
status, _ = storage_request(
    "/storage/v1/object/post-images/" + f"{a_id}/draft-{secrets.token_hex(8)}/anonymous.png",
    "POST", image, content_type="image/png")
denied(status, "ANONYMOUS_UPLOAD")
status, _ = storage_request(
    "/storage/v1/object/post-images/" + f"{a_id}/draft-{secrets.token_hex(8)}/note.txt",
    "POST", b"not an image", a_token, "text/plain")
denied(status, "NON_IMAGE_UPLOAD")
status, _ = storage_request(
    "/storage/v1/object/post-images/" + f"{a_id}/draft-{secrets.token_hex(8)}/oversize.png",
    "POST", b"x" * (10 * 1024 * 1024 + 1), a_token, "image/png")
denied(status, "OVERSIZE_UPLOAD")
print("LOCAL_STORAGE_BASE_E2E=PASS direct_insert_deny/spoof/update/delete/anon/declared_type/size")
status, _ = storage_request(
    "/storage/v1/object/post-images/" + f"{a_id}/draft-{secrets.token_hex(8)}/spoof.png",
    "POST", b"not an image", a_token, "image/png")
denied(status, "SPOOFED_IMAGE_MIME")
print("LOCAL_STORAGE_CONTENT_E2E=PASS")
