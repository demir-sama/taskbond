#!/usr/bin/env python3
"""Measure a fresh testnet payout, refund, and failed transfer on the deployed contract.

The contract is already initialized. This script does not redeploy and does not print keys.
"""

from __future__ import annotations

import base64
import json
import re
import subprocess
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RPC = "https://test.rpc.fastnear.com"
PARENT = "tb3ed5051370.testnet"
CONTRACT = f"escrow.{PARENT}"
POSTER = f"poster.{PARENT}"
OPS = f"ops.{PARENT}"
ADA = f"ada.{PARENT}"
GHOST = f"ghost.{PARENT}"


def scrub(text: str) -> str:
    text = re.sub(r"ed25519:[1-9A-HJ-NP-Za-km-z]+", "ed25519:[REDACTED]", text)
    text = re.sub(r"\b(?:[a-z]{3,8} ){11}[a-z]{3,8}\b", "[SEED-REDACTED]", text)
    return text


def rpc(method: str, params):
    body = json.dumps({"jsonrpc": "2.0", "id": "taskbond", "method": method, "params": params}).encode()
    request = urllib.request.Request(RPC, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=40) as response:
        payload = json.load(response)
    if "error" in payload:
        raise RuntimeError(json.dumps(payload["error"])[:500])
    return payload["result"]


def balance(account_id: str) -> int:
    result = rpc("query", {"request_type": "view_account", "finality": "final", "account_id": account_id})
    return int(result["amount"])


def view(method: str, args: dict | None = None):
    encoded = base64.b64encode(json.dumps(args or {}).encode()).decode()
    result = rpc(
        "query",
        {
            "request_type": "call_function",
            "finality": "final",
            "account_id": CONTRACT,
            "method_name": method,
            "args_base64": encoded,
        },
    )
    return json.loads(bytes(result["result"]).decode())


def tx_hash(text: str) -> str:
    match = re.search(r"Transaction ID:\s*([A-Za-z0-9]+)", text)
    if not match:
        raise RuntimeError(scrub(text)[-2500:])
    return match.group(1)


def near(args: list[str]) -> str:
    proc = subprocess.run(["near", *args], capture_output=True, text=True)
    text = (proc.stdout or "") + "\n" + (proc.stderr or "")
    if proc.returncode != 0:
        raise RuntimeError(scrub(text)[-4000:])
    return text


def call(account: str, method: str, args: dict, deposit_yocto: int = 0, gas: str = "120000000000000") -> dict:
    cmd = ["call", CONTRACT, method, json.dumps(args), "--use-account", account, "--network-id", "testnet", "--gas", gas]
    if deposit_yocto:
        cmd.extend(["--deposit-yocto", str(deposit_yocto)])
    text = near(cmd)
    hashed = tx_hash(text)
    return {
        "method": method,
        "signer": account,
        "hash": hashed,
        "explorer": f"https://explorer.testnet.near.org/transactions/{hashed}",
    }


def tx_status(tx: str, sender: str) -> dict:
    result = rpc("tx", {"tx_hash": tx, "sender_account_id": sender, "wait_until": "FINAL"})
    logs = []
    for outcome in [result.get("transaction_outcome")] + list(result.get("receipts_outcome") or []):
        if not outcome:
            continue
        logs.extend(outcome.get("outcome", {}).get("logs") or [])
    status = result.get("status")
    return {"status": status, "logs": logs}


def wait_balance(account_id: str, previous: int) -> int:
    for _ in range(20):
        current = balance(account_id)
        if current != previous:
            return current
        time.sleep(1)
    return balance(account_id)


def main() -> None:
    config = view("get_config")
    job_storage = int(config["job_storage"])
    agent_storage = int(config["agent_storage"])
    gas_reserve = int(config["gas_reserve"])
    reward = 100_000_000_000_000_000_000_000  # 0.1 NEAR, the contract minimum
    cap = 1_000_000_000_000_000_000_000  # 0.001 NEAR
    agent_deposit = agent_storage + gas_reserve + cap
    report = {
        "network": "testnet",
        "rpc": RPC,
        "contract": CONTRACT,
        "prior_jobs_already_final": [
            {"id": job["id"], "status": job["status"], "winner_owner": job["winner_owner"], "escrow_amount": job["escrow_amount"]}
            for job in view("list_jobs")
        ],
        "transactions": [],
    }

    def open_job(lifetime_ns: int) -> int:
        now = int(view("get_config")["now"])
        report["transactions"].append(
            call(
                POSTER,
                "create_job",
                {
                    "title": "Measured payout",
                    "topic": "Summarize how a NEAR account differs from an access key.",
                    "source_pack_hash": "cd" * 32,
                    "deadline_ns": str(now + lifetime_ns),
                },
                deposit_yocto=reward + job_storage,
            )
        )
        return int(view("list_jobs")[-1]["id"])

    job_id = open_job(3_600_000_000_000)
    report["transactions"].append(
        call(
            ADA,
            "register_agent",
            {"job_id": job_id, "name": "Ada Ledger", "prompt": "Summarize the pinned account-model sources and cite exact quotes."},
            deposit_yocto=agent_deposit,
        )
    )
    ada_id = int([a for a in view("list_agents", {"job_id": job_id}) if a["name"] == "Ada Ledger"][0]["id"])
    report["transactions"].append(call(OPS, "record_guard", {"agent_id": ada_id, "approved": True, "reason": "On topic."}))
    report["transactions"].append(
        call(
            ADA,
            "submit_result",
            {
                "agent_id": ada_id,
                "summary": "A NEAR account can hold several access keys. The key is not the account.",
                "steps": ["Read the account model.", "Separate keys from the account id."],
                "evidence": '{"citations":[{"sourceId":"account-model","quote":"unique account model"}]}',
            },
        )
    )
    ada = view("get_agent", {"agent_id": ada_id})
    report["transactions"].append(
        call(
            OPS,
            "record_review",
            {
                "agent_id": ada_id,
                "result_hash": ada["result_hash"],
                "evidence_hash": ada["evidence_hash"],
                "score": 88,
                "accept": True,
                "reason": "Bound hashes match the stored submission.",
            },
        )
    )
    before = balance(ADA)
    payout = call(OPS, "payout_winner", {"job_id": job_id}, gas="250000000000000")
    report["transactions"].append(payout)
    after = wait_balance(ADA, before)
    job = view("get_job", {"job_id": job_id})
    status = tx_status(payout["hash"], OPS)
    report["payout"] = {
        "job_id": job_id,
        "status": job["status"],
        "winner_owner": job["winner_owner"],
        "reward_yocto": str(reward),
        "winner_before_yocto": str(before),
        "winner_after_yocto": str(after),
        "winner_delta_yocto": str(after - before),
        "delta_equals_reward": after - before == reward,
        "transaction": payout["explorer"],
        "chain_logs": status["logs"],
        "chain_status": status["status"],
    }

    refund_job = open_job(20_000_000_000)
    poster_before = balance(POSTER)
    deadline = int(view("get_job", {"job_id": refund_job})["deadline_ns"])
    while int(view("get_config")["now"]) < deadline:
        time.sleep(2)
    refund = call(OPS, "refund_expired", {"job_id": refund_job}, gas="250000000000000")
    report["transactions"].append(refund)
    poster_after = wait_balance(POSTER, poster_before)
    refunded = view("get_job", {"job_id": refund_job})
    report["refund"] = {
        "job_id": refund_job,
        "status": refunded["status"],
        "reward_yocto": str(reward),
        "poster_before_yocto": str(poster_before),
        "poster_after_yocto": str(poster_after),
        "poster_delta_yocto": str(poster_after - poster_before),
        "delta_equals_reward": poster_after - poster_before == reward,
        "transaction": refund["explorer"],
        "chain_logs": tx_status(refund["hash"], OPS)["logs"],
    }

    fail_job = open_job(3_600_000_000_000)
    report["transactions"].append(
        call(
            GHOST,
            "register_agent",
            {"job_id": fail_job, "name": "Ghost", "prompt": "Summarize the pinned sources with exact quotes."},
            deposit_yocto=agent_deposit,
        )
    )
    ghost_id = int([a for a in view("list_agents", {"job_id": fail_job}) if a["name"] == "Ghost"][0]["id"])
    report["transactions"].append(call(OPS, "record_guard", {"agent_id": ghost_id, "approved": True, "reason": "On topic."}))
    report["transactions"].append(
        call(
            GHOST,
            "submit_result",
            {"agent_id": ghost_id, "summary": "Accounts and keys are different.", "steps": ["Read the source."], "evidence": '{"citations":[]}'},
        )
    )
    ghost = view("get_agent", {"agent_id": ghost_id})
    report["transactions"].append(
        call(
            OPS,
            "record_review",
            {
                "agent_id": ghost_id,
                "result_hash": ghost["result_hash"],
                "evidence_hash": ghost["evidence_hash"],
                "score": 50,
                "accept": True,
                "reason": "Accepted only so a transfer to a deleted account can fail.",
            },
        )
    )
    delete_text = near(["delete-account", GHOST, POSTER, "--network-id", "testnet", "--force"])
    report["ghost_deleted"] = {
        "hash": tx_hash(delete_text),
        "explorer": f"https://explorer.testnet.near.org/transactions/{tx_hash(delete_text)}",
        "beneficiary": POSTER,
    }
    contract_before = balance(CONTRACT)
    fail = call(OPS, "payout_winner", {"job_id": fail_job}, gas="250000000000000")
    report["transactions"].append(fail)
    failed = view("get_job", {"job_id": fail_job})
    contract_after = balance(CONTRACT)
    fail_status = tx_status(fail["hash"], OPS)
    report["failed_transfer"] = {
        "job_id": fail_job,
        "status": failed["status"],
        "escrow_claimable": failed["escrow_claimable"],
        "escrow_in_flight": failed["escrow_in_flight"],
        "marked_paid": failed["status"] == "Paid",
        "claimable_restored": failed["escrow_claimable"] == str(reward),
        "contract_balance_before": str(contract_before),
        "contract_balance_after": str(contract_after),
        "contract_balance_unchanged": contract_before == contract_after,
        "transaction": fail["explorer"],
        "chain_logs": fail_status["logs"],
    }
    report["confirmed"] = {
        "payout": report["payout"]["delta_equals_reward"] and report["payout"]["status"] == "Paid",
        "refund": report["refund"]["delta_equals_reward"] and report["refund"]["status"] == "Refunded",
        "failed_transfer_not_paid": (not report["failed_transfer"]["marked_paid"]) and report["failed_transfer"]["claimable_restored"],
    }
    path = ROOT / "artifacts" / "testnet-escrow.json"
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"wrote": str(path), "confirmed": report["confirmed"], "payout": report["payout"], "refund": report["refund"], "failed_transfer": report["failed_transfer"]}, indent=2))
    if not all(report["confirmed"].values()):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
