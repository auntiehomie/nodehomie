import unittest

from incidents import classify


class IncidentTests(unittest.TestCase):
    def test_error_omits_arbitrary_payload(self):
        self.assertEqual(classify("ERROR trie root hash mismatch shard_id=2 height=80 token=secret"),
                         ("Validation", "Trie root mismatch shard_id=2 height=80"))

    def test_remote_vote_is_not_local_evidence(self):
        self.assertIsNone(classify("received signed vote from validator"))

    def test_mode_and_vote_set_reads_are_distinct_from_local_signing(self):
        for mode, label in [("validator", "validator"), ("read", "read-node")]:
            self.assertEqual(classify(f"INFO Starting Snapchain {mode} node with public key: abcd"),
                             ("Node mode", f"Started in {label} mode"))
        self.assertEqual(classify("ERROR Read node received vote set request round=3"),
                         ("Consensus", "Read node received a vote-set request round=3"))
        self.assertEqual(classify("INFO Received prior-round votes for re-proposal"),
                         ("Consensus", "Received prior-round votes"))

    def test_local_vote(self):
        self.assertEqual(classify("locally signed vote round=4"),
                         ("Consensus", "Local vote signing reported round=4"))
