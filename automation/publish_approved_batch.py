"""Finite, owner-approved static release queue. Never generates or approves content."""
from __future__ import annotations
import argparse
from collections import Counter
from datetime import datetime, timedelta, timezone
import hashlib
import html
import json
import os
from pathlib import Path
import re
import subprocess
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
BATCH = ROOT / 'automation/approved_batches/20261123-28'
KST = timezone(timedelta(hours=9))
APPROVAL = 'review-20261128-fc4ae41e30ff4239'


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes((json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def date(value):
    return datetime.fromisoformat(value).astimezone(KST)


def cmd(*args):
    return subprocess.run(args, cwd=ROOT, check=True, capture_output=True,
                          text=True, encoding='utf-8').stdout.strip()


def confined(relative):
    path = (BATCH / relative).resolve()
    if not path.is_relative_to(BATCH.resolve()) or path.is_symlink():
        raise ValueError('Unsafe batch path')
    return path


def validate(manifest):
    if (manifest['approval_id'] != APPROVAL or
            manifest['publication_mode'] != 'USER_DIRECT_APPROVAL' or
            not manifest['content_approved_at'] or not manifest['publish_approved_at']):
        raise ValueError('Missing explicit owner approval')
    rows = manifest['items']
    if len(rows) != 17 or len({r['slug'] for r in rows}) != 17:
        raise ValueError('Unexpected approved scope')
    times = sorted(date(r['not_before']) for r in rows)
    if max(Counter(t.date() for t in times).values()) > 5:
        raise ValueError('Daily schedule limit')
    if any((b-a).total_seconds() < 1800 for a, b in zip(times, times[1:])):
        raise ValueError('Schedule spacing')
    parts = []
    for row in rows:
        if not re.fullmatch(r'[a-z0-9-]+', row['slug']):
            raise ValueError('Unsafe slug')
        if row['url'] != f"https://kfarmai.com/kb/{row['slug']}.html":
            raise ValueError('Unexpected production URL')
        if sha(confined(row['file'])) != row['html_sha256']:
            raise ValueError('Approved HTML hash changed: ' + row['slug'])
        source = confined(row['file']).read_text(encoding='utf-8')
        metadata = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', source).group(1))
        if metadata.get('datePublished') != row['not_before'] or metadata.get('headline') != row['title']:
            raise ValueError('Schedule/title differs from approved manuscript')
        parts.append((row['file'].replace('content/', 'candidate/', 1), row['html_sha256']))
        for photo in row['photos']:
            if not re.fullmatch(r'static/kb/[a-z0-9-]+\.webp', photo['file']):
                raise ValueError('Unsafe image destination')
            if sha(confined('content/' + photo['file'])) != photo['sha256']:
                raise ValueError('Approved photo hash changed')
            parts.append(('candidate/' + photo['file'], photo['sha256']))
    for asset in manifest['assets']:
        if asset['file'] not in ('content/static/css/editorial-review.css',
                                 'content/static/kfarmai-logo-horizontal.png'):
            raise ValueError('Unexpected shared asset')
        if sha(confined(asset['file'])) != asset['sha256']:
            raise ValueError('Approved asset hash changed')
        parts.append((asset['file'].replace('content/', 'candidate/', 1), asset['sha256']))
    identity = hashlib.sha256(json.dumps(sorted(parts), ensure_ascii=False,
                            separators=(',', ':')).encode()).hexdigest()
    if identity != manifest['approved_candidate_set_sha256'] or identity[:16] != APPROVAL.rsplit('-', 1)[1]:
        raise ValueError('Approved set identity changed')


def choose(manifest, registry, state, now):
    """No catch-up burst, no moving expired articles into another approved day."""
    if not date(manifest['window_start']) <= now < date(manifest['window_end']):
        return None, 'OUTSIDE_APPROVED_WINDOW'
    if any(x['status'] != 'VERIFIED' for x in state['releases']):
        return None, 'PREVIOUS_RELEASE_NOT_VERIFIED'
    if sum(x['date'] == now.date().isoformat() for x in registry['items']) >= 5:
        return None, 'DAILY_LIMIT'
    actual = [date(x['verified_at']) for x in state['releases']]
    if actual and now - max(actual) < timedelta(minutes=30):
        return None, 'MINIMUM_SPACING'
    existing = {x['slug'] for x in registry['items']}
    titles = {re.sub(r'\s+', '', x['title']) for x in registry['items']}
    for row in manifest['items']:
        when = date(row['not_before'])
        if row['slug'] in existing:
            continue
        if when.date() == now.date() and when <= now:
            if re.sub(r'\s+', '', row['title']) in titles:
                raise ValueError('Existing title intent requires human review')
            return row, 'DUE'
    return None, 'NOT_DUE'


def fetch(url):
    if not url.startswith('https://'):
        raise ValueError('HTTPS required')
    request = urllib.request.Request(url, headers={'User-Agent': 'KFarmAI-approved-editorial-audit/1.0'})
    with urllib.request.urlopen(request, timeout=40) as response:
        return response.read(), response.headers.get_content_charset() or 'utf-8'


def source_check(row):
    guards = read(BATCH / 'source-guards.json')[row['id']]
    results = []
    for guard in guards:
        raw, charset = fetch(guard['url'])
        text = html.unescape(re.sub(r'<[^>]+>', ' ', raw.decode(charset, errors='replace')))
        normalized = re.sub(r'\s+', '', text)
        if not all(re.sub(r'\s+', '', phrase) in normalized for phrase in guard['required']):
            raise ValueError('Official source changed/unavailable: ' + row['id'])
        if any(re.sub(r'\s+', '', phrase) in normalized for phrase in guard.get('forbidden', [])):
            raise ValueError('Official notice cancelled/closed: ' + row['id'])
        for attachment in guard.get('attachments', []):
            data, _ = fetch(attachment['url'])
            if hashlib.sha256(data).hexdigest() != attachment['sha256']:
                raise ValueError('Official attachment changed: ' + row['id'])
        results.append({'url': guard['url'], 'sha256': hashlib.sha256(raw).hexdigest(),
                        'checked_at': datetime.now(KST).isoformat(), 'required': guard['required'],
                        'attachments': guard.get('attachments', [])})
    return results


def materialize(manifest, row, registry, now):
    target = ROOT / 'kb' / (row['slug'] + '.html')
    sitemap = ROOT / 'sitemap.xml'
    xml = sitemap.read_text(encoding='utf-8')
    if target.exists() or row['url'] in xml:
        raise ValueError('Partial/duplicate publication requires reconciliation')
    changes = []
    files = [(confined(row['file']), target)]
    files += [(confined('content/' + p['file']), ROOT / p['file']) for p in row['photos']]
    files += [(confined(a['file']), ROOT / a['file'].removeprefix('content/')) for a in manifest['assets']]
    for source, destination in files:
        if destination.exists() and sha(destination) != sha(source):
            raise ValueError('Existing asset conflict: ' + destination.name)
    for source, destination in files:
        if not destination.exists():
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(source.read_bytes())
            changes.append(destination.relative_to(ROOT).as_posix())
    registry['items'].append({
        'slug': row['slug'], 'title': row['title'], 'category': row['category'],
        'date': now.date().isoformat(), 'url': row['url'],
        'publication_mode': 'USER_DIRECT_APPROVAL', 'approval_id': manifest['approval_id'],
        'content_approved_at': manifest['content_approved_at'], 'publish_approved_at': manifest['publish_approved_at'],
        'html_sha256': row['html_sha256'], 'image_sha256': row['photos'][0]['sha256'],
        'photos': row['photos'], 'source_urls': [s['url'] for s in row['sources']],
        'research_date': row['research_date'], 'research_bucket': row['bucket'],
        'release_started_at': now.isoformat(), 'scheduled_for': row['not_before'],
        'publication_status': row['decision'],
    })
    write(ROOT / 'automation/daily_registry.json', registry)
    if xml.count('</urlset>') != 1:
        raise ValueError('Invalid sitemap boundary')
    xml = xml.replace('</urlset>', f"  <url><loc>{row['url']}</loc><lastmod>{now.date()}</lastmod></url>\n</urlset>")
    sitemap.write_bytes(xml.encode())
    return changes + ['automation/daily_registry.json', 'sitemap.xml']


def verify_public(row):
    raw, _ = fetch(row['url'])
    expected = ROOT / '_site/kb' / (row['slug'] + '.html')
    if hashlib.sha256(raw).hexdigest() != sha(expected):
        raise ValueError('Public HTML does not match verified Pages build')
    for photo in row['photos']:
        data, _ = fetch('https://kfarmai.com/' + photo['file'])
        if hashlib.sha256(data).hexdigest() != photo['sha256']:
            raise ValueError('Public photo hash mismatch')
    sitemap, _ = fetch('https://kfarmai.com/sitemap.xml')
    if sitemap.decode().count('<loc>' + row['url'] + '</loc>') != 1:
        raise ValueError('Public sitemap entry missing/duplicate')
    index, _ = fetch('https://kfarmai.com/data/kb-index.json')
    if row['slug'] not in index.decode():
        raise ValueError('Public agriculture index missing')
    for listing in ('/kb/index.html', '/agri-info.html', '/index.html'):
        page, _ = fetch('https://kfarmai.com' + listing)
        if ('/kb/' + row['slug'] + '.html') not in page.decode():
            raise ValueError('Public listing missing: ' + listing)
    return datetime.now(KST).isoformat()


def commit_push(paths, message):
    cmd('git', 'add', '--', *paths)
    cmd('git', 'diff', '--cached', '--check')
    cmd('git', 'commit', '-m', message)
    head = cmd('git', 'rev-parse', 'HEAD')
    cmd('git', 'push', 'origin', 'HEAD:main')
    return head


def deploy_and_audit(row, head):
    cmd('gh', 'workflow', 'run', 'pages.yml', '--repo', 'dgilink/kfarmai', '--ref', 'main')
    run = None
    for _ in range(24):
        runs = json.loads(cmd('gh', 'run', 'list', '--repo', 'dgilink/kfarmai', '--workflow', 'pages.yml',
                             '--commit', head, '--event', 'workflow_dispatch', '--json', 'databaseId,url', '--limit', '5'))
        if runs:
            run = runs[0]
            break
        time.sleep(5)
    if not run:
        raise ValueError('Pages dispatch receipt not found')
    cmd('gh', 'run', 'watch', str(run['databaseId']), '--repo', 'dgilink/kfarmai', '--exit-status', '--interval', '15')
    # CDN rollout may trail the successful deployment receipt. Read-only checks only.
    for attempt in range(12):
        try:
            return verify_public(row), run
        except (ValueError, OSError):
            if attempt == 11:
                raise
            time.sleep(10)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--release', action='store_true')
    parser.add_argument('--check-sources', action='store_true')
    args = parser.parse_args()
    manifest = read(BATCH / 'manifest.json')
    validate(manifest)
    state = read(BATCH / 'state.json')
    if args.check_sources:
        for row in manifest['items']:
            source_check(row)
            print('SOURCE_PASS ' + row['id'])
        return
    now = datetime.now(KST)
    if args.release and now >= date(manifest['window_end']) and os.environ.get('GITHUB_REPOSITORY') == 'dgilink/kfarmai':
        cmd('gh', 'workflow', 'disable', 'kfarmai-approved-batch-20261128.yml', '--repo', 'dgilink/kfarmai')
        print('APPROVED_WINDOW_EXPIRED_WORKFLOW_DISABLED')
        return
    row, reason = choose(manifest, read(ROOT / 'automation/daily_registry.json'), state, now)
    if not args.release or row is None:
        print(json.dumps({'status': reason, 'next': row['slug'] if row else None,
                          'approval': APPROVAL, 'approved_count': 17}))
        return
    if os.environ.get('GITHUB_REPOSITORY') != 'dgilink/kfarmai' or os.environ.get('GITHUB_REF') != 'refs/heads/main':
        raise ValueError('Release only from approved repository main workflow')
    if cmd('git', 'status', '--porcelain', '--untracked-files=no'):
        raise ValueError('Tracked checkout is dirty')
    if cmd('git', 'rev-parse', 'HEAD') != cmd('git', 'ls-remote', 'origin', 'refs/heads/main').split()[0]:
        raise ValueError('Main advanced before release')
    # An unrelated manual publisher also consumes the time-spacing budget.
    last_change = date(cmd('git', 'log', '-1', '--format=%cI', '--', 'kb', 'automation/daily_registry.json'))
    if now - last_change < timedelta(minutes=30):
        print('MINIMUM_SPACING_OTHER_PUBLICATION')
        return
    checked_sources = source_check(row)
    paths = materialize(manifest, row, read(ROOT / 'automation/daily_registry.json'), now)
    cmd('node', 'scripts/pages/build-pages-artifact.cjs', '--output=_site')
    cmd('node', 'scripts/pages/verify-pages-artifact.cjs', '_site')
    cmd('node', '--test', 'tests/seo-publication.test.cjs', 'tests/sitemap-semantic.test.cjs')
    cmd('git', 'diff', '--check')
    receipt = {'slug': row['slug'], 'status': 'RELEASED_AWAITING_PUBLIC_VERIFICATION',
               'started_at': now.isoformat(), 'sources': checked_sources,
               'scheduler_run': os.environ.get('GITHUB_RUN_ID')}
    state['releases'].append(receipt)
    write(BATCH / 'state.json', state)
    state_path = (BATCH / 'state.json').relative_to(ROOT).as_posix()
    head = commit_push(paths + [state_path], 'Publish approved scheduled article: ' + row['slug'])
    verified_at, run = deploy_and_audit(row, head)
    receipt.update(status='VERIFIED', verified_at=verified_at, release_commit=head,
                   pages_run=run['url'], public_url=row['url'])
    write(BATCH / 'state.json', state)
    commit_push([state_path], 'Record public verification: ' + row['slug'])
    if len(state['releases']) == len(manifest['items']):
        cmd('gh', 'workflow', 'disable', 'kfarmai-approved-batch-20261128.yml', '--repo', 'dgilink/kfarmai')
    print(json.dumps({'status': 'VERIFIED', 'url': row['url'], 'pages_run': run['url']}))


if __name__ == '__main__':
    main()
