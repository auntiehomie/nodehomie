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

    def test_error_shows_redacted_message(self):
        line = ("2026-11-23T17:20:24.934931Z ERROR snapchain::mempool::mempool: "
                "Unable to send message from mempool")
        self.assertEqual(classify(line), ("Error", "mempool: Unable to send message from mempool"))

    def test_error_message_drops_ids_and_payloads(self):
        line = ('ERROR node{name=0x0149 Block}:consensus{height=[0] 51096272 round=0}: '
                'informalsystems_malachitebft_engine::consensus: Error when processing ReceivedProposedValue '
                'message: Decided value not found after commit timeout height=[0] 51096272 token=secret')
        kind, label = classify(line)
        self.assertEqual(kind, "Consensus")
        self.assertEqual(label, "Consensus timeout · consensus: Error when processing ReceivedProposedValue "
                                "message: Decided value not found after commit timeout round=0")
        self.assertNotIn("secret", label)

    def test_warning_redacts_peers_and_addresses(self):
        line = ('WARN snapchain::network::gossip: Failed to dial peer 12D3KooWABCDEF '
                'at 85.209.231.221:3382 via 0123456789abcdef0123')
        self.assertEqual(classify(line), ("Warning", "gossip: Failed to dial peer <peer> at <ip> via <hash>"))

    def test_unparseable_error_keeps_generic_label(self):
        self.assertEqual(classify("ERROR something broke"), ("Error", "Container logged an error"))

    def test_local_vote(self):
        self.assertEqual(classify("locally signed vote round=4"),
                         ("Consensus", "Local vote signing reported round=4"))
