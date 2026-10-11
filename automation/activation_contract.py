"""Gate-specific activation contract; no environment flag authorizes execution."""
import argparse
from kfarmai_review_approval import Blocked, require


def validate_approval(receipt, gate, head_sha, config_sha):
    require(gate in {'B', 'C', 'D'}, 'INVALID_GATE')
    require(receipt.get('gate') == gate and receipt.get('repository') == 'dgilink/kfarmai', 'GATE_APPROVAL_MISMATCH')
    require(receipt.get('head_sha') == head_sha and receipt.get('config_sha256') == config_sha, 'STALE_APPROVAL')
    require(receipt.get('owner_verified') is True and receipt.get('environment_protection_verified') is True
            and receipt.get('explicit_human_approval') is True, 'PROTECTED_APPROVAL_REQUIRED')
    require(receipt.get('mode') == {'B': 'REVIEW_ONLY_ONE_PAID_CALL', 'C': 'ARTIFACT_ISSUE_ONLY', 'D': 'APPROVED_PUBLICATION'}[gate], 'GATE_SCOPE_MISMATCH')
    # This validates a fixture contract only. A trusted GitHub environment/OIDC
    # verifier is not implemented; JSON booleans cannot authorize live access.
    return {'contract_valid': True, 'live_authorized': False}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--gate', required=True, choices=['B', 'C', 'D'])
    parser.parse_args()
    raise Blocked('LIVE_ACTIVATION_REQUIRES_SEPARATE_REVIEWED_IMPLEMENTATION')


if __name__ == '__main__':
    main()
