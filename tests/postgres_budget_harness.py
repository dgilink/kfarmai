"""Local test-only Docker transport; never accepts a DB URL or credentials."""
import json
import os
import re
from pathlib import Path
import subprocess

CONTAINER = os.environ.get('KFARMAI_TEST_POSTGRES_CONTAINER', '')


def sql(statement):
    if not re.fullmatch(r'kfarmai-integration4-budget-[a-z0-9-]+', CONTAINER):
        raise RuntimeError('Disposable Integration-4 container required')
    config = json.loads(subprocess.check_output(['docker', 'inspect', CONTAINER]))[0]
    if (config['HostConfig']['NetworkMode'] != 'none'
            or config['Config'].get('Labels', {}).get('kfarmai.preflight') != 'integration4'
            or any(m['Type'] != 'tmpfs' for m in config['Mounts'])
            or config['HostConfig'].get('PortBindings')):
        raise RuntimeError('DB fixture isolation not verified')
    result = subprocess.run(['docker', 'exec', '-i', CONTAINER, 'psql', '-X', '-qAt',
                             '-v', 'ON_ERROR_STOP=1', '-U', 'postgres'],
                            input=statement, text=True, capture_output=True, timeout=40)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()


def rpc(command, payload):
    encoded = json.dumps(payload, allow_nan=False).replace("'", "''")
    assert command.replace('_', '').isalpha()
    return json.loads(sql(f"set role service_role; select public.kfarmai_budget('{command}','{encoded}'::jsonb);"))


def install():
    sql('create role anon; create role authenticated; create role service_role bypassrls;')
    root = Path(__file__).resolve().parents[1]
    sql((root / 'supabase/migrations/20261010011009_automation_durable_budget.sql').read_text(encoding='utf-8'))


def reset(limit=1000000):
    sql('truncate kfarmai_private.reservations, kfarmai_private.review_outbox; '
        f'update kfarmai_private.budget_policy set enabled=true,daily_microusd={int(limit)};')
