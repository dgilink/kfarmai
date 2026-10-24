"""Local-only real Auth/Edge/Storage gate; never uses a production URL or service role."""
import io
import json
import re
import secrets
import shutil
import subprocess
import urllib.error
import urllib.request
from PIL import Image

cli = shutil.which('supabase.exe') or shutil.which('supabase.cmd') or shutil.which('supabase')
raw = subprocess.run([cli, 'status', '--output', 'json'], capture_output=True, text=True, check=True).stdout
def setting(name):
    match = re.search(r'^\s*"' + re.escape(name) + r'"\s*:\s*"([^"]+)"', raw, re.M)
    if not match:
        raise RuntimeError('missing local ' + name)
    return match.group(1)
api = setting('API_URL').rstrip('/')
if not re.fullmatch(r'http://127\.0\.0\.1:\d+', api):
    raise RuntimeError('LOCAL_ONLY_API_REQUIRED')
anon = setting('ANON_KEY')

def call(path, method='GET', body=None, token=None, content_type='application/json'):
    headers = {'apikey': anon}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    if body is not None:
        headers['Content-Type'] = content_type
    request = urllib.request.Request(api + path, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            data = response.read()
            return response.status, json.loads(data) if data and 'json' in response.headers.get('Content-Type', '') else data
    except urllib.error.HTTPError as error:
        data = error.read()
        return error.code, json.loads(data) if data and 'json' in error.headers.get('Content-Type', '') else data

def auth(label):
    email = f'phase7g-{label}-{secrets.token_hex(8)}@example.test'
    password = secrets.token_urlsafe(20)
    status, data = call('/auth/v1/signup', 'POST', json.dumps({'email': email, 'password': password}).encode())
    assert status in (200, 201), ('signup', status)
    status, login = call('/auth/v1/token?grant_type=password', 'POST', json.dumps({'email': email, 'password': password}).encode())
    assert status == 200, ('login', status)
    return data['user']['id'], login['access_token']

def image(format):
    output = io.BytesIO()
    Image.new('RGB', (32, 24), (20, 120, 180)).save(output, format=format)
    return output.getvalue()

def oversized_dimensions():
    output = io.BytesIO()
    Image.new('RGB', (4097, 1), (20, 120, 180)).save(output, format='PNG')
    return output.getvalue()

def multipart(data, filename, mime, purpose='create', post_id=None):
    boundary = 'kfarmai-' + secrets.token_hex(12)
    fields = {'purpose': purpose}
    if post_id is not None:
        fields['postId'] = post_id
    chunks = []
    for key, value in fields.items():
        chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode())
    chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\nContent-Type: {mime}\r\n\r\n'.encode() + data + b'\r\n')
    chunks.append(f'--{boundary}--\r\n'.encode())
    return b''.join(chunks), 'multipart/form-data; boundary=' + boundary

def upload(data, filename, mime, token=None, purpose='create', post_id=None):
    body, content_type = multipart(data, filename, mime, purpose, post_id)
    return call('/functions/v1/secure-image-upload', 'POST', body, token, content_type)

a_id, a_token = auth('a')
b_id, b_token = auth('b')
status, rows = call('/rest/v1/posts', 'POST', json.dumps({'user_id': a_id, 'title': 'local image fixture', 'content': 'fixture'}).encode(), a_token)
assert status == 201, ('post creation', status)
status, posts = call('/rest/v1/posts?select=id&user_id=eq.' + a_id, token=a_token)
post_id = posts[-1]['id']
good = {}
for format, mime, ext in [('JPEG', 'image/jpeg', 'jpg'), ('PNG', 'image/png', 'png'), ('WEBP', 'image/webp', 'webp')]:
    status, data = upload(image(format), 'photo.' + ext, mime, a_token)
    assert status == 201, ('valid ' + format, status, data)
    assert data['path'].startswith(a_id + '/draft-') and data['path'].endswith('.webp')
    status, output = call('/storage/v1/object/public/post-images/' + data['path'])
    assert status == 200, ('public image', status)
    Image.open(io.BytesIO(output)).verify()
    good[format] = data
status, data = upload(image('PNG'), 'edit.png', 'image/png', a_token, 'edit', post_id)
assert status == 201 and data['path'].startswith(a_id + '/' + post_id + '/')
status, _ = upload(image('PNG'), 'edit.png', 'image/png', b_token, 'edit', post_id)
assert status in (401, 403), ('other post edit', status)
status, _ = upload(image('PNG'), 'edit.png', 'image/png', b_token)
assert status == 201, ('B own upload', status)
for label, bytes_, mime in [
    ('HTML spoof', b'<html><script>alert(1)</script></html>', 'image/png'),
    ('random spoof', secrets.token_bytes(100), 'image/jpeg'),
    ('MIME mismatch', image('PNG'), 'image/jpeg'),
    ('corrupt', image('PNG')[:35], 'image/png'),
    ('SVG', b'<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'image/svg+xml'),
    ('oversize', image('PNG') + b'0' * (4 * 1024 * 1024), 'image/png'),
    ('excess dimensions', oversized_dimensions(), 'image/png'),
]:
    status, _ = upload(bytes_, 'photo.png', mime, a_token)
    assert status >= 400, (label, status)
status, _ = upload(image('PNG'), 'photo.png', 'image/png')
assert status in (401, 403), ('anonymous', status)
status, _ = upload(image('PNG'), 'photo.png', 'image/png', 'bad.jwt.value')
assert status in (401, 403), ('invalid jwt', status)
status, _ = upload(image('PNG'), 'photo.png', 'image/png', a_token, 'edit', b_id)
assert status >= 400, ('invalid post ID', status)
status, denied = call('/storage/v1/object/post-images/' + a_id + '/draft-bypass/x.webp', 'POST', image('WEBP'), a_token, 'image/webp')
assert status in (400, 401, 403) and b'polic' in str(denied).lower().encode(), ('direct insert bypass', status, denied)
status, denied = call('/storage/v1/object/post-images/' + good['PNG']['path'], 'DELETE', token=b_token)
assert status in (400, 401, 403), ('other delete', status, denied)
status, existing = call('/storage/v1/object/public/post-images/' + good['PNG']['path'])
assert status == 200 and existing, ('other delete changed object', status)
print('LOCAL_GATEWAY_E2E_PASS')
