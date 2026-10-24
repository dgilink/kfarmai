"""Local-only Edge performance probe. No production credentials or URLs."""
import concurrent.futures
import io
import json
import os
import re
import secrets
import shutil
import statistics
import subprocess
import time
import urllib.error
import urllib.request
from PIL import Image

cli = shutil.which('supabase.exe') or shutil.which('supabase.cmd') or shutil.which('supabase')
raw = subprocess.run([cli, 'status', '--output', 'json'], capture_output=True, text=True, check=True).stdout
def local_setting(name):
    found = re.search(r'^\s*"' + re.escape(name) + r'"\s*:\s*"([^"]+)"', raw, re.M)
    if not found:
        raise RuntimeError('missing local setting ' + name)
    return found.group(1)
api = local_setting('API_URL').rstrip('/')
if not re.fullmatch(r'http://127\.0\.0\.1:\d+', api):
    raise RuntimeError('local API required')
anon = local_setting('ANON_KEY')
email = 'phase7gm-' + secrets.token_hex(8) + '@example.test'
password = secrets.token_urlsafe(24)
def auth_request(path, data):
    req = urllib.request.Request(api + path, data=json.dumps(data).encode(),
                                 headers={'apikey': anon, 'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.load(response)
auth_request('/auth/v1/signup', {'email': email, 'password': password})
token = auth_request('/auth/v1/token?grant_type=password', {'email': email, 'password': password})['access_token']

def jpg(width, height, quality):
    image = Image.frombytes('RGB', (width, height), os.urandom(width * height * 3))
    output = io.BytesIO()
    image.save(output, 'JPEG', quality=quality)
    return output.getvalue()
def png(width, height):
    output = io.BytesIO()
    Image.new('RGB', (width, height), (20, 100, 180)).save(output, 'PNG')
    return output.getvalue()
cases = {
    'small': (jpg(128, 96, 85), 'image/jpeg'),
    'phone': (jpg(1600, 1200, 77), 'image/jpeg'),
    'near_limit': (jpg(2600, 1900, 85), 'image/jpeg'),
    'large_resolution_compressed': (png(4000, 3000), 'image/png'),
    'corrupt': (b'\x89PNG\r\n\x1a\n' + b'0' * 100, 'image/png'),
    'mime_spoof': (b'<html><script>bad()</script></html>', 'image/png'),
}

def cgroup():
    cmd = ['docker', 'exec', 'supabase_edge_runtime_kfarmai-v3-local', 'sh', '-c',
           "cat /sys/fs/cgroup/cpu.stat /sys/fs/cgroup/memory.current /sys/fs/cgroup/memory.peak"]
    output = subprocess.run(cmd, capture_output=True, text=True, timeout=10, check=True).stdout
    cpu = re.search(r'usage_usec (\d+)', output)
    numbers = [int(x) for x in re.findall(r'^\d+$', output, re.M)]
    return {'cpu_usec': int(cpu.group(1)) if cpu else None,
            'memory_current': numbers[-2] if len(numbers) >= 2 else None,
            'memory_peak': numbers[-1] if numbers else None}

def request_image(data, mime):
    boundary = 'phase7gm-' + secrets.token_hex(12)
    body = (f'--{boundary}\r\nContent-Disposition: form-data; name="purpose"\r\n\r\ncreate\r\n'
            f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="probe"\r\n'
            f'Content-Type: {mime}\r\n\r\n').encode() + data + f'\r\n--{boundary}--\r\n'.encode()
    req = urllib.request.Request(api + '/functions/v1/secure-image-upload', data=body,
        headers={'apikey': anon, 'Authorization': 'Bearer ' + token,
                 'Content-Type': 'multipart/form-data; boundary=' + boundary}, method='POST')
    start = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=90) as response:
            response.read()
            return {'status': response.status, 'wall_ms': round((time.perf_counter() - start) * 1000, 1),
                    'server_timing': response.headers.get('Server-Timing', '')}
    except urllib.error.HTTPError as error:
        error.read()
        return {'status': error.code, 'wall_ms': round((time.perf_counter() - start) * 1000, 1),
                'server_timing': error.headers.get('Server-Timing', '')}

before = cgroup()
results = {}
for name, (data, mime) in cases.items():
    samples = [request_image(data, mime) for _ in range(3 if name not in ('corrupt', 'mime_spoof') else 1)]
    wall = [sample['wall_ms'] for sample in samples]
    results[name] = {'input_bytes': len(data), 'statuses': [s['status'] for s in samples],
                     'wall_ms': wall, 'p50_ms': round(statistics.median(wall), 1),
                     'sample_p95_ms': max(wall), 'timings': [s['server_timing'] for s in samples]}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    concurrent = list(pool.map(lambda _: request_image(*cases['phone']), range(3)))
after = cgroup()
results['concurrent_phone_3'] = concurrent
results['edge_cgroup_delta_cpu_ms'] = (after['cpu_usec'] - before['cpu_usec']) / 1000 if before['cpu_usec'] is not None else None
results['edge_cgroup_peak_memory_mib'] = round(after['memory_peak'] / 1048576, 1) if after['memory_peak'] else None
for name in ('small', 'phone', 'near_limit', 'large_resolution_compressed'):
    assert results[name]['statuses'] == [201, 201, 201], (name, results[name]['statuses'])
for name in ('corrupt', 'mime_spoof'):
    assert results[name]['statuses'] == [415], (name, results[name]['statuses'])
assert [item['status'] for item in concurrent] == [201, 201, 201], concurrent
print(json.dumps(results, ensure_ascii=False))
