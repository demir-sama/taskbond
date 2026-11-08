#!/usr/bin/env python3
"""Deploy Taskbond to a fresh testnet account and prove escrow payout.

Reads keys only from the NEAR CLI legacy keychain. Writes public receipts to
artifacts/testnet-escrow.json. Never prints private keys.
"""

from __future__ import annotations

import base64
import hashlib
import json
import re
import subprocess
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WASM = ROOT / "target" / "near" / "taskbond" / "taskbond.wasm"
ARTIFACTS = ROOT / "artifacts"
RPC = "https://test.rpc.fastnear.com"
PARENT = "tb3ed5051370.testnet"
CONTRACT = f"escrow.{PARENT}"
POSTER = f"poster.{PARENT}"
OPS = f"ops.{PARENT}"
ADA = f"ada.{PARENT}"
GHOST = f"ghost.{PARENT}"
NETWORK = "testnet"


def scrub(text: str) -> str:
    text = re.sub(r"ed25519:[1-9A-HJ-NP-Za-km-z]+", "ed25519:[REDACTED]", text)
    text = re.sub(r"\b(?:[a-z]{3,8} ){11}[a-z]{3,8}\b", "[SEED-REDACTED]", text)
    return text


def rpc(method: str, params: dict) -> dict:
    body = json.dumps({"jsonrpc": "2.0", "id": "taskbond", "method": method, "params": params}).encode()
    request = urllib.request.Request(RPC, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=40) as response:
        payload = json.load(response)
    if "error" in payload:
        raise RuntimeError(payload["error"])
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
    raw = bytes(result["result"]).decode()
    return json.loads(raw)


def tx_hash(text: str) -> str | None:
    match = re.search(r"Transaction ID:\s*([A-Za-z0-9]+)", text)
    return match.group(1) if match else None


def near(args: list[str]) -> str:
    proc = subprocess.run(["near", *args], capture_output=True, text=True)
    text = scrub((proc.stdout or "") + "\n" + (proc.stderr or ""))
    if proc.returncode != 0:
        raise RuntimeError(f"near {' '.join(args[:6])} failed\n{text[-4000:]}")
    return text


def call(account: str, method: str, args: dict, deposit_yocto: int = 0, gas: str = "80000000000000") -> dict:
    cmd = [
        "call",
        CONTRACT,
        method,
        json.dumps(args),
        "--use-account",
        account,
        "--network-id",
        NETWORK,
        "--gas",
        gas,
    ]
    if deposit_yocto:
        cmd.extend(["--deposit-yocto", str(deposit_yocto)])
    text = near(cmd)
    hashed = tx_hash(text)
    if not hashed:
        raise RuntimeError(f"no transaction id for {method}\n{text[-2000:]}")
    return {"method": method, "signer": account, "hash": hashed, "explorer": f"https://explorer.testnet.near.org/transactions/{hashed}", "log": text[-1500:]}


def main() -> None:
    ARTIFACTS.mkdir(exist_ok=True)
    if not WASM.exists():
        raise SystemExit(f"missing wasm at {WASM}; run cargo near build in contract/")
    wasm_sha = hashlib.sha256(WASM.read_bytes()).hexdigest()
    report: dict = {
        "network": "testnet",
        "rpc": RPC,
        "contract": CONTRACT,
        "parent": PARENT,
        "poster": POSTER,
        "operator_guard_reviewer": OPS,
        "winner": ADA,
        "wasm_sha256": wasm_sha,
        "transactions": [],
    }

    init_args = json.dumps({"owner": OPS, "operator": OPS, "guard": OPS, "reviewer": OPS})
    deploy_text = near(
        [
            "deploy",
            CONTRACT,
            str(WASM),
            "--init-function",
            "init",
            "--init-args",
            init_args,
            "--init-gas",
            "100000000000000",
            "--network-id",
            NETWORK,
        ]
    )
    deploy_hash = tx_hash(deploy_text)
    report["deploy"] = {
        "hash": deploy_hash,
        "explorer": f"https://explorer.testnet.near.org/transactions/{deploy_hash}" if deploy_hash else None,
    }
    report["transactions"].append(call(OPS, "set_rate", {"yocto_per_nano_usd": "1000000000000000"}))
    report["transactions"].append(
        call(
            OPS,
            "freeze_model",
            {
                "model_id": "Qwen/Qwen3.8-27B",
                "input_amount": "40",
                "output_amount": "1350",
                "scale": 9,
                "context_length": 262144,
                "max_output": 65536,
                "provider_type": "vllm",
                "verifiable": True,
            },
        )
    )
    config = view("get_config")
    report["frozen_model"] = config["model"]
    report["worst_case_yocto"] = config["worst_case"]
    report["rate_yocto_per_nano_usd"] = config["yocto_per_nano_usd"]
    job_storage = int(config["job_storage"])
    agent_storage = int(config["agent_storage"])
    gas_reserve = int(config["gas_reserve"])
    reward = 200_000_000_000_000_000_000_000  # 0.2 NEAR
    cap = 10_000_000_000_000_000_000_000  # 0.01 NEAR, no inference reserve in this proof

    def open_job(lifetime_ns: int) -> int:
        now = int(view("get_config")["now"])
        report["transactions"].append(
            call(
                POSTER,
                "create_job",
                {
                    "title": "How NEAR accounts differ from keys",
                    "topic": "Summarize the official account model and cite the pinned source pack.",
                    "source_pack_hash": "ab" * 32,
                    "deadline_ns": str(now + lifetime_ns),
                },
                deposit_yocto=reward + job_storage,
                gas="100000000000000",
            )
        )
        jobs = view("list_jobs")
        return int(jobs[-1]["id"])

    payout_job = open_job(3_600_000_000_000)
    report["transactions"].append(
        call(
            ADA,
            "register_agent",
            {
                "job_id": payout_job,
                "name": "Ada",
                "prompt": "Summarize the pinned NEAR account-model sources. Cite source ids and exact quotes.",
            },
            deposit_yocto=agent_storage + gas_reserve + cap,
            gas="100000000000000",
        )
    )
    ada_id = int(view("list_agents", {"job_id": payout_job})[-1]["id"])
    report["transactions"].append(
        call(OPS, "record_guard", {"agent_id": ada_id, "approved": True, "reason": "Stays on the research job."})
    )
    report["transactions"].append(
        call(
            ADA,
            "submit_result",
            {
                "agent_id": ada_id,
                "summary": "A NEAR account holds keys and a contract. An access key is not the account.",
                "steps": ["Read the pinned account-model page.", "Quote the access-key distinction."],
                "evidence": '{"citations":[{"sourceId":"account-model","quote":"unique account model"}]}',
            },
            gas="100000000000000",
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
                "score": 90,
                "accept": True,
                "reason": "The summary answers the topic and the evidence hash is bound.",
            },
        )
    )
    ada_before = balance(ADA)
    payout_tx = call(OPS, "payout_winner", {"job_id": payout_job}, gas="200000000000000")
    report["transactions"].append(payout_tx)
    time.sleep(2)
    ada_after = balance(ADA)
    job = view("get_job", {"job_id": payout_job})
    report["payout"] = {
        "job_id": payout_job,
        "status": job["status"],
        "winner_owner": job["winner_owner"],
        "escrow_amount": job["escrow_amount"],
        "reward_yocto": str(reward),
        "winner_before_yocto": str(ada_before),
        "winner_after_yocto": str(ada_after),
        "winner_delta_yocto": str(ada_after - ada_before),
        "delta_equals_reward": ada_after - ada_before == reward,
        "transaction": payout_tx["explorer"],
    }
    if job["status"] != "Paid" or ada_after - ada_before != reward:
        raise SystemExit(f"payout was not confirmed: {json.dumps(report['payout'])}")

    refund_job = open_job(25_000_000_000)
    poster_before = balance(POSTER)
    deadline = int(view("get_job", {"job_id": refund_job})["deadline_ns"])
    while int(view("get_config")["now"]) < deadline:
        time.sleep(3)
    refund_tx = call(OPS, "refund_expired", {"job_id": refund_job}, gas="200000000000000")
    report["transactions"].append(refund_tx)
    time.sleep(2)
    poster_after = balance(POSTER)
    refunded = view("get_job", {"job_id": refund_job})
    report["refund"] = {
        "job_id": refund_job,
        "status": refunded["status"],
        "poster_before_yocto": str(poster_before),
        "poster_after_yocto": str(poster_after),
        "poster_delta_yocto": str(poster_after - poster_before),
        "delta_equals_reward": poster_after - poster_before == reward,
        "transaction": refund_tx["explorer"],
        "note": "Poster did not sign refund_expired, so the credit is the full reward. The create_job gas was paid earlier and is outside this delta.",
    }

    fail_job = open_job(3_600_000_000_000)
    report["transactions"].append(
        call(
            GHOST,
            "register_agent",
            {"job_id": fail_job, "name": "Ghost", "prompt": "Summarize the pinned sources with exact quotes."},
            deposit_yocto=agent_storage + gas_reserve + cap,
            gas="100000000000000",
        )
    )
    ghost_id = int([agent for agent in view("list_agents", {"job_id": fail_job}) if agent["name"] == "Ghost"][0]["id"])
    report["transactions"].append(
        call(OPS, "record_guard", {"agent_id": ghost_id, "approved": True, "reason": "On topic."})
    )
    report["transactions"].append(
        call(
            GHOST,
            "submit_result",
            {
                "agent_id": ghost_id,
                "summary": "Accounts and keys are different objects.",
                "steps": ["Read the source."],
                "evidence": '{"citations":[]}',
            },
            gas="100000000000000",
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
                "score": 60,
                "accept": True,
                "reason": "Accepted so the missing-account transfer can be observed.",
            },
        )
    )
    delete_text = near(["delete-account", GHOST, POSTER, "--network-id", NETWORK, "--force"])
    report["ghost_deleted"] = {"hash": tx_hash(delete_text), "beneficiary": POSTER}
    contract_before = balance(CONTRACT)
    fail_tx = call(OPS, "payout_winner", {"job_id": fail_job}, gas="200000000000000")
    report["transactions"].append(fail_tx)
    time.sleep(2)
    failed_job = view("get_job", {"job_id": fail_job})
    contract_after = balance(CONTRACT)
    report["failed_transfer"] = {
        "job_id": fail_job,
        "status": failed_job["status"],
        "escrow_claimable": failed_job["escrow_claimable"],
        "escrow_in_flight": failed_job["escrow_in_flight"],
        "marked_paid": failed_job["status"] == "Paid",
        "claimable_restored": failed_job["escrow_claimable"] == str(reward),
        "contract_balance_before": str(contract_before),
        "contract_balance_after": str(contract_after),
        "contract_balance_unchanged": contract_before == contract_after,
        "transaction": fail_tx["explorer"],
    }
    report["confirmed"] = {
        "payout": report["payout"]["delta_equals_reward"] and report["payout"]["status"] == "Paid",
        "refund": report["refund"]["delta_equals_reward"] and report["refund"]["status"] == "Refunded",
        "failed_transfer_not_paid": (not report["failed_transfer"]["marked_paid"])
        and report["failed_transfer"]["claimable_restored"],
    }
    # Drop raw CLI tails from the committed artifact. Hashes and explorer links stay.
    for item in report["transactions"]:
        item.pop("log", None)
    path = ARTIFACTS / "testnet-escrow.json"
    path.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"wrote": str(path), "confirmed": report["confirmed"], "payout": report["payout"], "refund": report["refund"], "failed_transfer": report["failed_transfer"]}, indent=2))
    if not all(report["confirmed"].values()):
        raise SystemExit("testnet proof incomplete")


if __name__ == "__main__":
    main()
