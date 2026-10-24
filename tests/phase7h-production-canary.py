"""Explicit, bounded Production Edge canary. Never uses member accounts or files."""

import concurrent.futures
import io
import json
import secrets
import shutil
import statistics
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from PIL import Image


REF = "xzetqijeucldbfgjuoes"
BASE = f"https://{REF}.supabase.co"
if sys.argv[1:] != ["--allow-production-canary"]:
    raise SystemExit("Explicit --allow-production-canary required")

cli = shutil.which("supabase.exe") or shutil.which("supabase.cmd") or shutil.which("supabase")
if not cli:
    raise SystemExit("Supabase CLI unavailable")
keys = json.loads(subprocess.run(
    [cli, "projects", "api-keys", "--project-ref", REF, "--output", "json"],
    check=True, capture_output=True, text=True,
).stdout)
service = next(k["api_key"] for k in keys if k["name"] == "service_role")
anon = next(k["api_key"] for k in keys if k["name"] == "anon")
users = []
paths = []
posts = []
public_users = []
result = {"project_ref": REF, "cases": {}, "cleanup": {}}
post_title = "[Phase 7H canary] " + secrets.token_hex(8)


def call(path, method="GET", body=None, jwt=None, key=anon, content_type=None, timeout=60,
         prefer=None):
    headers = {"apikey": key}
    if jwt:
        headers["Authorization"] = "Bearer " + jwt
    if content_type:
        headers["Content-Type"] = content_type
    if prefer:
        headers["Prefer"] = prefer
    request = urllib.request.Request(BASE + path, data=body, headers=headers, method=method)
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read(), round((time.perf_counter() - started) * 1000, 1)
    except urllib.error.HTTPError as error:
        error.read()
        return error.code, b"", round((time.perf_counter() - started) * 1000, 1)


def json_call(path, method, payload, jwt=None, key=anon, timeout=60, prefer=None):
    status, body, elapsed = call(path, method, json.dumps(payload).encode(), jwt, key,
                                 "application/json", timeout, prefer)
    return status, json.loads(body) if body else {}, elapsed


def user(label):
    email = f"phase7h-{label}-{secrets.token_hex(10)}@example.invalid"
    password = secrets.token_urlsafe(24) + "!Aa9"
    status, body, _ = json_call("/auth/v1/admin/users", "POST", {
        "email": email, "password": password, "email_confirm": True,
        "user_metadata": {"purpose": "phase7h-production-canary"},
    }, service, service)
    assert status in (200, 201), ("create_canary_user", status)
    user_id = body["id"]
    users.append(user_id)
    status, body, _ = json_call("/auth/v1/token?grant_type=password", "POST",
                                 {"email": email, "password": password})
    assert status == 200 and body["user"]["id"] == user_id, ("login_canary_user", status)
    token = body["access_token"]
    status, _, _ = json_call("/rest/v1/users", "POST", {
        "id": user_id, "nickname": "Phase 7H canary",
    }, token)
    assert status in (201, 409), ("create_canary_profile", status)
    if status == 201:
        public_users.append((user_id, token))
    return user_id, token


def picture(fmt, size=(40, 32), noise=False):
    output = io.BytesIO()
    if noise:
        image = Image.frombytes("RGB", size, secrets.token_bytes(size[0] * size[1] * 3))
    else:
        image = Image.new("RGB", size, (18, 88, 180))
    image.save(output, format=fmt, quality=83)
    return output.getvalue()


def upload(data, mime, token=None, purpose="create", post_id=None):
    boundary = "phase7h-" + secrets.token_hex(10)
    fields = [("purpose", purpose)]
    if post_id:
        fields.append(("postId", post_id))
    body = b"".join(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
                    for k, v in fields)
    body += (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="canary"\r\n'
             f'Content-Type: {mime}\r\n\r\n').encode() + data + f"\r\n--{boundary}--\r\n".encode()
    status, raw, elapsed = call("/functions/v1/secure-image-upload", "POST", body, token,
                                anon, f"multipart/form-data; boundary={boundary}", 90)
    response = json.loads(raw) if raw else {}
    if status == 201:
        path = response.get("path", "")
        assert any(path.startswith(uid + "/") for uid in users), "unexpected canary path"
        paths.append(path)
    return status, response, elapsed


def record(label, status, expected, elapsed):
    result["cases"][label] = {"status": status, "pass": status in expected, "wall_ms": elapsed}


try:
    a_id, a_token = user("a")
    b_id, b_token = user("b")
    status, post, _ = json_call("/rest/v1/posts?select=id", "POST", {
        "user_id": a_id, "title": post_title, "content": "Temporary image gateway test.",
    }, a_token, prefer="return=representation")
    if status in (200, 201) and post:
        post_id = post[0]["id"] if isinstance(post, list) else post["id"]
        posts.append((post_id, a_token))
    else:
        post_id = None
        result["cases"]["fixture_post"] = {"status": status, "pass": False, "reason": "missing returned id"}

    for fmt, mime in (("JPEG", "image/jpeg"), ("PNG", "image/png"), ("WEBP", "image/webp")):
        status, response, elapsed = upload(picture(fmt), mime, a_token)
        record(fmt, status, {201}, elapsed)
        if status == 201:
            path = response["path"]
            public_status, data, _ = call("/storage/v1/object/public/post-images/" + path)
            try:
                Image.open(io.BytesIO(data)).verify()
                valid_image = True
            except Exception:
                valid_image = False
            result["cases"][fmt]["public_webp"] = public_status == 200 and valid_image

    phone = picture("JPEG", (1600, 1200), True)
    near_input = picture("JPEG", (2600, 1900), True)
    assert 3 * 1024 * 1024 < len(near_input) <= 4 * 1024 * 1024, "near-limit fixture invalid"
    for label, data, mime in (
        ("phone", phone, "image/jpeg"),
        ("near_input_limit", near_input, "image/jpeg"),
        ("max_pixels", picture("PNG", (4000, 3000)), "image/png"),
    ):
        samples = [upload(data, mime, a_token) for _ in range(3)]
        times = [sample[2] for sample in samples]
        result["cases"][label] = {"statuses": [s[0] for s in samples],
                                  "pass": all(s[0] == 201 for s in samples),
                                  "p50_ms": round(statistics.median(times), 1),
                                  "p95_sample_ms": max(times), "n": len(times)}

    for label, data, mime, token, expected in (
        ("html_spoof", b"<html>not an image</html>", "image/png", a_token, {413, 415}),
        ("corrupt", picture("PNG")[:35], "image/png", a_token, {415}),
        ("anonymous", picture("JPEG"), "image/jpeg", None, {401, 403}),
        ("invalid_jwt", picture("JPEG"), "image/jpeg", "invalid.jwt.token", {401, 403}),
        ("oversize", b"x" * (4 * 1024 * 1024 + 1), "image/jpeg", a_token, {413}),
    ):
        status, _, elapsed = upload(data, mime, token)
        record(label, status, expected, elapsed)

    if post_id:
        status, _, elapsed = upload(picture("JPEG"), "image/jpeg", a_token, "edit", post_id)
        record("own_post", status, {201}, elapsed)
        status, _, elapsed = upload(picture("JPEG"), "image/jpeg", b_token, "edit", post_id)
        record("other_post", status, {401, 403}, elapsed)

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        concurrent = list(pool.map(lambda _: upload(phone, "image/jpeg", b_token), range(3)))
    result["cases"]["concurrent_3"] = {
        "statuses": [x[0] for x in concurrent], "pass": all(x[0] == 201 for x in concurrent),
        "wall_ms": [x[2] for x in concurrent], "n": 3,
    }
finally:
    # Remove only paths generated by these canary users, using the Storage API.
    safe_paths = [p for p in paths if any(p.startswith(uid + "/") for uid in users)]
    if safe_paths:
        status, _, _ = json_call("/storage/v1/object/post-images", "DELETE",
                                  {"prefixes": safe_paths}, service, service)
        result["cleanup"]["storage_status"] = status
        result["cleanup"]["storage_count"] = len(safe_paths)
    for post_id, _ in posts:
        status, _, _ = call("/rest/v1/posts?id=eq." + post_id, "DELETE", None, service, service)
        result["cleanup"].setdefault("post_statuses", []).append(status)
    # Also catch a successful INSERT without a returned id; this title is unique to this run.
    filter_path = "/rest/v1/posts?select=id&title=eq." + urllib.parse.quote(post_title, safe="")
    status, raw, _ = call(filter_path, "GET", None, service, service)
    if status == 200:
        for row in json.loads(raw):
            delete_status, _, _ = call("/rest/v1/posts?id=eq." + row["id"], "DELETE",
                                       None, service, service)
            result["cleanup"].setdefault("post_statuses", []).append(delete_status)
    for uid, _ in public_users:
        status, _, _ = call("/rest/v1/users?id=eq." + uid, "DELETE", None, service, service)
        result["cleanup"].setdefault("profile_statuses", []).append(status)
    for uid in users:
        status, _, _ = call("/auth/v1/admin/users/" + uid, "DELETE", None, service, service)
        result["cleanup"].setdefault("user_statuses", []).append(status)
    result["pass"] = bool(result["cases"]) and all(x.get("pass", False) and x.get("public_webp", True)
                                                  for x in result["cases"].values())
    result["pass"] &= result["cleanup"].get("storage_status", 200) in (200, 204)
    result["pass"] &= all(x in (200, 204) for x in result["cleanup"].get("post_statuses", []))
    result["pass"] &= all(x in (200, 204) for x in result["cleanup"].get("profile_statuses", []))
    result["pass"] &= all(x in (200, 204) for x in result["cleanup"].get("user_statuses", []))
    print(json.dumps(result, ensure_ascii=False))
