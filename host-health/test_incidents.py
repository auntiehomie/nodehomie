import unittest

from incidents import classify


class IncidentTests(unittest.TestCase):
    def test_error_omits_arbitrary_payload(self):
        self.assertEqual(classify("ERROR trie root hash mismatch shard_id=2 height=80 token=secret"),
                         ("Validation", "Trie root mismatch shard_id=2 height=80"))

    def test_remote_vote_is_not_local_evidence(self):
        self.assertIsNone(classify("received signed vote from validator"))

    def test_local_vote(self):
        self.assertEqual(classify("locally signed vote round=4"),
                         ("Consensus", "Local vote signing reported round=4"))
