"""Read-only audit for the specific Testnet order-1 purchase trace.
Usage: python scripts/audit-testnet-order1-receipts.py trace.json
Input: TON Center v3 /traces?tx_hash=TNcBS...&include_actions=false
No signing, broadcasting, or refund calculation.
"""
import base64
import json
import sys

ROOT = "WMlWb6hWYlAY9IffC5PmF4Q/eCH8J8+lxsmku12dzaw="
BUY = "TNcBSRs5vivBstJFXfSj4I/BCrScoKLIK5cQf1/MJew="
CALLBACK = "OgFj1qyRogl9PQAmc51z1XJW8QbxGZJedqU8ZZyNpRc="
MARKET = "0:AFBEE05D75E79B81D234F235244C6CDFBA52D183607C86A5D666B9478A0294B1"
RECIPIENT = "0:12441E171AD37CD4FC1A79FE9F5A7489C91C30244BDB6CF9FE92CCF429023E6C"
PROCESSORS = {
    MARKET,
    "0:F48F347634AFACE2B6EF73378776660979D7EC4607BD3EC7566D3E76346B0475",
    "0:AAD7755826A4343A8BFE6B6F8C284E7B31622E12D8906A817F9583420049C0A1",
}
LEGS = [
    ("seller", "0x71b00101", 9700000,
     "Ab/loRDAe1D0mtncAdj6eTvJJ6CSMF2Mr9NLmz/itdo=",
     "dNSFRbnuWjbLPLSGzUFK/txrMCMoaze3oF3hoevcrSY="),
    ("platform", "0x71b00102", 300000,
     "xhhVFHm3h1JytgM4M6BDXay+HeKq5BzS/MF4Nrndx/4=",
     "uv1Te9smcv8BUKMcHprYTLx65cztBqKT+01GfhrMKZ4="),
]


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(value):
    result = base64.b64decode(value, validate=True)
    require(len(result) == 32, "Invalid transaction or message hash")
    return result


def audit(payload):
    traces = payload.get("traces", [])
    require(len(traces) == 1, "Expected one trace")
    trace = traces[0]
    require(trace.get("is_incomplete") is False, "Incomplete trace")
    info = trace.get("trace_info", {})
    require(info.get("trace_state") == "complete", "Trace is not complete")
    require(info.get("pending_messages") == 0, "Pending messages")
    require(int(trace.get("mc_seqno_end", 0)) > 0, "Unfinalized trace")
    require(trace.get("trace_id") == ROOT, "Wrong trace root")
    txs = trace["transactions"]
    require(len(txs) == 10 and info.get("transactions") == 10, "Unexpected transaction count")
    seen = set()
    for key, tx in txs.items():
        require(digest(key) == digest(tx["hash"]), "Transaction key/hash mismatch")
        require(digest(key) not in seen, "Duplicate transaction")
        seen.add(digest(key))
        desc = tx["description"]
        require(desc.get("aborted") is False, "Aborted transaction")
        require(desc.get("compute_ph", {}).get("success") is True, "Compute failed")
        if "action" in desc:
            require(desc["action"].get("success") is True, "Action failed")
    outgoing = {}
    for tx in txs.values():
        for msg in tx.get("out_msgs", []):
            key = digest(msg["hash"])
            require(key not in outgoing, "Duplicate outbound message")
            outgoing[key] = msg
    consumed = set()
    for key, tx in txs.items():
        if key == ROOT:
            continue
        incoming = tx["in_msg"]
        msg_key = digest(incoming["hash"])
        require(msg_key in outgoing and msg_key not in consumed, "Missing or duplicate parent linkage")
        consumed.add(msg_key)
        parent_msg = outgoing[msg_key]
        for field in ["source", "destination", "value"]:
            require(parent_msg.get(field) == incoming.get(field), "Message edge mismatch")
        require(incoming.get("bounced") is False, "Bounced receipt")
    require(len(consumed) == len(outgoing), "Unconsumed outbound message")
    payment = txs[BUY]["in_msg"]
    require(payment["opcode"] == "0x71b00100", "Wrong purchase operation")
    require(payment["destination"] == MARKET and payment["value"] == "210000000", "Wrong payment")
    callback = txs[CALLBACK]
    require(callback["account"] == MARKET, "Wrong settlement sender")
    receipts = []
    for name, opcode, amount, message_hash, receipt_hash in LEGS:
        emitted = [m for m in callback["out_msgs"] if m["hash"] == message_hash]
        require(len(emitted) == 1, "Missing or duplicate payout")
        received = txs[receipt_hash]
        msg = received["in_msg"]
        for item in [emitted[0], msg]:
            require(item["opcode"] == opcode and item["value"] == str(amount), "Wrong payout amount or opcode")
            require(item["source"] == MARKET and item["destination"] == RECIPIENT, "Wrong payout parties")
        require(msg["hash"] == message_hash, "Receipt hash mismatch")
        require(received["account"] == RECIPIENT, "Wrong receiving account")
        require(received["description"]["credit_ph"]["credit"] == str(amount), "Credit amount mismatch")
        receipts.append(dict(kind=name, credited_nano=amount, message_hash=message_hash, receipt_hash=receipt_hash))
    observed_fees = sum(int(t["total_fees"]) for t in txs.values() if t["account"] in PROCESSORS)
    return dict(network="testnet", order_id=1, trace_id=ROOT, marketplace_buy_hash=BUY,
                mc_seqno_end=trace["mc_seqno_end"], transaction_count=10,
                receipts=receipts, seller_and_treasury_same_account=True,
                observed_processor_fees_nano=observed_fees,
                reserve_nano=200000000, refundable_nano=None,
                reserve_status="manual_review_attribution_unproven",
                limitation="Observed account fees do not prove per-order reserve consumption; no refund authorized.")


if __name__ == "__main__":
    print(json.dumps(audit(json.load(open(sys.argv[1]))), indent=2))
