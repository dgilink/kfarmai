import copy
from datetime import timedelta
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('approved_batch', ROOT/'automation/publish_approved_batch.py')
batch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(batch)


class ApprovedBatchTests(unittest.TestCase):
    def setUp(self):
        self.manifest = batch.read(batch.BATCH/'manifest.json')
        self.registry = {'items': []}
        self.state = {'releases': []}
        self.now = batch.date('2026-11-29T09:00:00+09:00')

    def test_approved_content_bytes_and_scope(self):
        batch.validate(self.manifest)

    def test_approval_and_hash_tampering_fail_closed(self):
        for field in ('approval_id', 'content_approved_at', 'publish_approved_at'):
            m = copy.deepcopy(self.manifest)
            m[field] = ''
            with self.assertRaises(ValueError):
                batch.validate(m)
        m = copy.deepcopy(self.manifest)
        m['items'][0]['html_sha256'] = '0'*64
        with self.assertRaises(ValueError):
            batch.validate(m)

    def test_before_window_does_not_publish(self):
        self.assertIsNone(batch.choose(self.manifest, self.registry, self.state,
                                      batch.date('2026-11-28T18:00:00+09:00'))[0])

    def test_first_due_and_duplicate_skip(self):
        row, _ = batch.choose(self.manifest, self.registry, self.state, self.now)
        self.assertEqual(row['id'], 'meister')
        self.registry['items'].append({'slug': row['slug'], 'date': '2026-11-29', 'title': row['title']})
        self.assertIsNone(batch.choose(self.manifest, self.registry, self.state, self.now)[0])

    def test_all_other_publications_count_toward_five(self):
        self.registry['items'] = [{'date': '2026-11-29', 'slug': str(i), 'title': str(i)} for i in range(5)]
        self.assertEqual(batch.choose(self.manifest, self.registry, self.state, self.now)[1], 'DAILY_LIMIT')

    def test_spacing_uses_actual_public_verification(self):
        self.state['releases'] = [{'status': 'VERIFIED', 'verified_at': self.now.isoformat()}]
        self.assertEqual(batch.choose(self.manifest, self.registry, self.state,
                                     self.now+timedelta(minutes=29))[1], 'MINIMUM_SPACING')
        self.assertIsNotNone(batch.choose(self.manifest, self.registry, self.state,
                                         self.now+timedelta(minutes=30))[0])

    def test_failed_previous_deployment_blocks_next(self):
        self.state['releases'] = [{'status': 'RELEASED_AWAITING_PUBLIC_VERIFICATION'}]
        self.assertEqual(batch.choose(self.manifest, self.registry, self.state, self.now)[1],
                         'PREVIOUS_RELEASE_NOT_VERIFIED')

    def test_delayed_queue_never_publishes_yesterday(self):
        row, _ = batch.choose(self.manifest, self.registry, self.state,
                              batch.date('2026-11-30T09:00:00+09:00'))
        self.assertEqual(row['id'], 'kitchen')

    def test_expired_year_cannot_run(self):
        self.assertEqual(batch.choose(self.manifest, self.registry, self.state,
                                     batch.date('2027-11-29T09:00:00+09:00'))[1], 'OUTSIDE_APPROVED_WINDOW')

    def test_same_title_and_path_escape_blocked(self):
        self.registry['items'] = [{'slug': 'other', 'title': self.manifest['items'][0]['title'], 'date': '2026-11-20'}]
        with self.assertRaises(ValueError):
            batch.choose(self.manifest, self.registry, self.state, self.now)
        with self.assertRaises(ValueError):
            batch.confined('../../../../outside')

    def test_changed_source_fails_closed(self):
        guard = {'meister': [{'url': 'https://example.invalid/', 'required': ['original deadline']}]}
        with patch.object(batch, 'read', return_value=guard), patch.object(batch, 'fetch', return_value=(b'changed', 'utf-8')):
            with self.assertRaises(ValueError):
                batch.source_check(self.manifest['items'][0])

    def test_materialization_preserves_approved_bytes_and_refuses_repeat(self):
        with tempfile.TemporaryDirectory(prefix='kfarmai-batch-test-') as tmp:
            root = Path(tmp)
            (root/'kb').mkdir()
            (root/'sitemap.xml').write_text('<urlset>\n</urlset>\n')
            row = self.manifest['items'][0]
            with patch.object(batch, 'ROOT', root):
                batch.materialize(self.manifest, row, self.registry, self.now)
                self.assertEqual(batch.sha(root/'kb'/f"{row['slug']}.html"), row['html_sha256'])
                self.assertEqual(len(self.registry['items']), 1)
                with self.assertRaises(ValueError):
                    batch.materialize(self.manifest, row, self.registry, self.now)


if __name__ == '__main__':
    unittest.main()
