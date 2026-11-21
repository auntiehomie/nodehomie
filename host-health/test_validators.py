import unittest
from unittest.mock import patch

from validators import active_peers, peer_id, signing_key, summarize

WAKE = "22e82d8886c9c73fe8dd5b6c1df474100f5d9289e7352ea590361d23837074d0"
IDENTITY = "12D3KooWCAdNQJvE9eH258D55b6zodhLoW2B8xRJEtayozGX1Jud"


class ValidatorTests(unittest.TestCase):
    @patch.dict("os.environ", {"NODEHOMIE_VALIDATOR_PUBLIC_KEY": ""})
    def test_identity_matches_published_wake_peer(self):
        self.assertEqual(signing_key(IDENTITY).hex(), WAKE)
        self.assertEqual(peer_id(bytes.fromhex(WAKE)), IDENTITY)

    def test_future_set_does_not_remove_active_peer(self):
        schedule = [{"effective_at": 2, "shard_ids": [1], "validator_public_keys": [WAKE]},
                    {"effective_at": 20, "shard_ids": [1], "validator_public_keys": []}]
        self.assertEqual(active_peers(schedule, 1, 19), [IDENTITY])
        self.assertEqual(active_peers(schedule, 1, 20), [])
        self.assertIsNone(active_peers(schedule, 2, 20))

    def test_counts_distinct_certificates_in_shard_and_window(self):
        def block(shard, height, signer):
            return {"commits": {"height": {"shardIndex": shard, "blockNumber": str(height)},
                                "signatures": [{"signer": signer, "signature": "sig"}]}}
        blocks = [block(1, 12, "YQ=="), block(1, 12, "YQ=="), block(1, 13, "Yg=="),
                  block(0, 14, "YQ=="), block(1, 15, "YQ=="), {}]
        self.assertEqual(summarize(blocks, 1, 12, 14, b"a"), {"checked": 2, "signed": 1, "last": 12})
