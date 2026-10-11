"""Upload output -> downloaded immutable bytes -> durable Issue outbox.

Only injectable fixture transports are accepted in this Candidate. There is no
GitHub upload or Issue mutation adapter and this module never publishes content.
"""
import re
from approval_package import render_issue
from durable_budget import fingerprint
from kfarmai_review_approval import require, metadata, REPOSITORY


def validate_upload_identity(outputs, artifact, manifest):
    """Validate upload-artifact outputs against the REST artifact response."""
    require(isinstance(outputs, dict), 'BLOCKED_UPLOAD_FAILED')
    artifact_id = outputs.get('artifact-id')
    require(isinstance(artifact_id, str) and re.fullmatch(r'[1-9][0-9]*', artifact_id), 'BLOCKED_UPLOAD_OUTPUT')
    require(re.fullmatch(r'[a-f0-9]{64}', str(outputs.get('artifact-digest', ''))), 'BLOCKED_UPLOAD_OUTPUT')
    run_id = manifest['source_run_id']
    expected_name = 'review-' + manifest['approval_id']
    expected_url = f'https://github.com/{REPOSITORY}/actions/runs/{run_id}/artifacts/{artifact_id}'
    require(outputs.get('artifact-url') == expected_url, 'BLOCKED_UPLOAD_OUTPUT')
    require(isinstance(artifact, dict) and artifact.get('id') == int(artifact_id)
            and artifact.get('name') == expected_name and artifact.get('expired') is False
            and artifact.get('digest') == 'sha256:' + outputs['artifact-digest']
            and artifact.get('workflow_run', {}).get('id') == run_id
            and artifact.get('workflow_run', {}).get('head_sha') == manifest['source_head_sha'],
            'BLOCKED_ARTIFACT_IDENTITY')
    return int(artifact_id)


def review_report(package, transport, budget):
    require(getattr(transport, 'is_fixture', False) is True, 'LIVE_GITHUB_WRITE_DISABLED')
    manifest = package['manifest']
    name = 'review-' + manifest['approval_id']
    # Transport uploads these exact nine files at the archive root, not package.zip.
    outputs = transport.find_upload(name, manifest['source_run_id'])
    if outputs is None:
        outputs = transport.upload(name, dict(package['files']))
    artifact_id = outputs.get('artifact-id') if isinstance(outputs, dict) else None
    require(isinstance(artifact_id, str) and re.fullmatch(r'[1-9][0-9]*', artifact_id), 'BLOCKED_UPLOAD_OUTPUT')
    artifact, raw = transport.download(int(artifact_id))
    validate_upload_identity(outputs, artifact, manifest)
    issue = render_issue(package, artifact, uploaded_raw=raw)
    identity = {'approval_id': manifest['approval_id'], 'fingerprint': fingerprint(issue['metadata'])}
    claim = budget.call('issue_claim', identity)
    matches = transport.find_issues(manifest['approval_id'])
    require(isinstance(matches, list) and len(matches) <= 1, 'BLOCKED_DUPLICATE_ISSUES')
    if matches:
        existing = matches[0]
        require(metadata(existing) == issue['metadata'], 'BLOCKED_ISSUE_BINDING')
        require(claim.get('state') in ('CREATING', 'ISSUED'), 'BLOCKED_UNOWNED_ISSUE')
        receipt = budget.call('issue_complete', {**identity, 'issue_number': existing['number']})
        return {'state': 'REVIEW', 'published': False, 'issue': existing, 'receipt': receipt,
                'artifact': artifact, 'archive': raw}
    require(claim.get('acquired') is True, 'BLOCKED_ISSUE_UNCERTAIN_NO_RETRY')
    require(budget.call('issue_creating', identity).get('execute') is True, 'BLOCKED_ISSUE_CLAIM')
    # A lost/failed create response leaves CREATING. A retry can only reconcile
    # an exactly matching Issue; it must never blindly call create again.
    created = transport.create_issue({'title': issue['title'], 'body': issue['body']})
    require(metadata(created) == issue['metadata'], 'BLOCKED_ISSUE_BINDING')
    require(type(created.get('number')) is int and created['number'] > 0, 'BLOCKED_ISSUE_RESPONSE')
    receipt = budget.call('issue_complete', {**identity, 'issue_number': created['number']})
    return {'state': 'REVIEW', 'published': False, 'issue': created, 'receipt': receipt,
            'artifact': artifact, 'archive': raw}
