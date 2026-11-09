use taskbond_billing::cost_yocto;
use near_sdk::json_types::{U128, U64};
use near_sdk::store::IterableMap;
use near_sdk::{env, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseError};

/// Non-refundable storage bond for a job record. Covers protocol storage
/// lock for the job's bounded fields. It is not part of the reward.
pub const JOB_STORAGE: u128 = 30_000_000_000_000_000_000_000; // 0.03 NEAR
/// Non-refundable storage bond for an agent, including bounded prompt,
/// summary, steps, and evidence kept so a rejection stays visible.
pub const AGENT_STORAGE: u128 = 80_000_000_000_000_000_000_000; // 0.08 NEAR
/// Refundable gas buffer. It cannot be spent as inference budget.
pub const GAS_RESERVE: u128 = 5_000_000_000_000_000_000_000; // 0.005 NEAR
pub const MIN_REWARD: u128 = 100_000_000_000_000_000_000_000; // 0.1 NEAR
pub const RESERVATION_TTL_NS: u64 = 15 * 60 * 1_000_000_000;
pub const MAX_DEADLINE_WINDOW_NS: u64 = 7 * 24 * 60 * 60 * 1_000_000_000;
pub const MAX_NAME: usize = 64;
pub const MAX_PROMPT: usize = 2_000;
pub const MAX_TOPIC: usize = 400;
pub const MAX_TITLE: usize = 100;
pub const MAX_REASON: usize = 280;
pub const MAX_SUMMARY: usize = 1_000;
pub const MAX_STEP: usize = 200;
pub const MAX_STEPS: usize = 8;
pub const MAX_EVIDENCE: usize = 1_800;
pub const MAX_MODEL_ID: usize = 128;
pub const MAX_JOBS: u64 = 1_000;
pub const MAX_AGENTS_PER_JOB: u64 = 8;
pub const CALLBACK_GAS: Gas = Gas::from_tgas(30);

#[derive(Clone, PartialEq, Eq)]
#[near(serializers = [borsh, json])]
pub enum JobStatus {
    Open,
    PayoutInFlight,
    Paid,
    RefundInFlight,
    Refunded,
}

#[derive(Clone, PartialEq, Eq)]
#[near(serializers = [borsh, json])]
pub enum AgentStatus {
    PendingGuard,
    Approved,
    Rejected,
}

#[derive(Clone, PartialEq, Eq)]
#[near(serializers = [borsh, json])]
pub enum ReviewState {
    None,
    Pending,
    Rejected,
    Accepted,
}

#[derive(Clone, PartialEq, Eq)]
#[near(serializers = [borsh, json])]
pub enum Purpose {
    Guard,
    Worker,
    Reviewer,
}

#[derive(Clone, PartialEq, Eq)]
#[near(serializers = [borsh, json])]
pub enum PayerKind {
    Agent,
    Operator,
}

#[derive(Clone, PartialEq, Eq)]
#[near(serializers = [borsh, json])]
pub enum ReservationStatus {
    Reserved,
    Settled,
    Reconciled,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[near(serializers = [borsh, json])]
pub enum TransferKind {
    Payout,
    Refund,
    AgentWithdraw,
    Reimbursement,
    OperatorWithdraw,
}

#[derive(Clone)]
#[near(serializers = [borsh, json])]
pub struct ModelPrice {
    pub model_id: String,
    pub input_amount: u128,
    pub output_amount: u128,
    pub scale: u32,
    pub context_length: u64,
    pub max_output: u64,
    pub provider_type: String,
    pub verifiable: bool,
}

#[derive(Clone)]
#[near(serializers = [borsh, json])]
pub struct Job {
    pub id: u64,
    pub poster: AccountId,
    pub title: String,
    pub topic: String,
    pub job_type: String,
    pub source_pack_hash: String,
    pub deadline_ns: u64,
    pub status: JobStatus,
    pub escrow_amount: u128,
    pub escrow_claimable: u128,
    pub escrow_in_flight: u128,
    pub storage_stake: u128,
    pub winner_agent_id: Option<u64>,
    pub winner_owner: Option<AccountId>,
    pub result_hash: Option<String>,
    pub evidence_hash: Option<String>,
    pub score: Option<u8>,
    pub agent_count: u64,
}

#[derive(Clone)]
#[near(serializers = [borsh, json])]
pub struct Agent {
    pub id: u64,
    pub job_id: u64,
    pub owner: AccountId,
    pub name: String,
    pub prompt: String,
    pub prompt_hash: String,
    pub status: AgentStatus,
    pub guard_reason: String,
    pub cap: u128,
    pub spent: u128,
    pub reserved: u128,
    pub unspent: u128,
    pub gas_reserve: u128,
    pub storage_stake: u128,
    pub refund_locked: u128,
    pub gas_locked: u128,
    pub summary: String,
    pub steps: Vec<String>,
    pub evidence: String,
    pub result_hash: String,
    pub evidence_hash: String,
    pub review: ReviewState,
    pub review_reason: String,
}

#[derive(Clone)]
#[near(serializers = [borsh, json])]
pub struct Reservation {
    pub id: String,
    pub payer: PayerKind,
    pub agent_id: u64,
    pub purpose: Purpose,
    pub amount: u128,
    pub status: ReservationStatus,
    pub created_at: u64,
    pub expires_at: u64,
    pub settled_input: u64,
    pub settled_output: u64,
    pub settled_cost: u128,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    owner: AccountId,
    operator: AccountId,
    guard: AccountId,
    reviewer: AccountId,
    yocto_per_nano_usd: u128,
    model: Option<ModelPrice>,
    params_locked: bool,
    next_job_id: u64,
    next_agent_id: u64,
    jobs: IterableMap<u64, Job>,
    agents: IterableMap<u64, Agent>,
    reservations: IterableMap<String, Reservation>,
    operator_unspent: u128,
    operator_reserved: u128,
    operator_spent: u128,
    operator_refund_locked: u128,
    accrued_reimbursement: u128,
    reimbursement_in_flight: u128,
}

#[near]
impl Contract {
    #[init]
    pub fn init(
        owner: AccountId,
        operator: AccountId,
        guard: AccountId,
        reviewer: AccountId,
    ) -> Self {
        Self {
            owner,
            operator,
            guard,
            reviewer,
            yocto_per_nano_usd: 0,
            model: None,
            params_locked: false,
            next_job_id: 1,
            next_agent_id: 1,
            jobs: IterableMap::new(b"j"),
            agents: IterableMap::new(b"a"),
            reservations: IterableMap::new(b"r"),
            operator_unspent: 0,
            operator_reserved: 0,
            operator_spent: 0,
            operator_refund_locked: 0,
            accrued_reimbursement: 0,
            reimbursement_in_flight: 0,
        }
    }

    pub fn set_rate(&mut self, yocto_per_nano_usd: U128) {
        self.assert_owner();
        require!(!self.params_locked, "params locked");
        require!(yocto_per_nano_usd.0 > 0, "rate must be positive");
        self.yocto_per_nano_usd = yocto_per_nano_usd.0;
    }

    /// Freeze the public model snapshot. Ceilings are the billable worst case.
    /// `verifiable` is stored for disclosure and does not change control flow.
    pub fn freeze_model(
        &mut self,
        model_id: String,
        input_amount: U128,
        output_amount: U128,
        scale: u32,
        context_length: u64,
        max_output: u64,
        provider_type: String,
        verifiable: bool,
    ) {
        self.assert_owner();
        require!(!self.params_locked, "params locked");
        require!(self.yocto_per_nano_usd > 0, "set rate first");
        require!(model_id.len() <= MAX_MODEL_ID && !model_id.is_empty(), "model id");
        require!(provider_type.len() <= 32 && !provider_type.is_empty(), "provider");
        require!(scale == 9, "only nanoUSD scale 9");
        require!(input_amount.0 > 0 && output_amount.0 > 0, "price must be positive");
        require!(context_length > 0 && max_output > 0, "ceilings required");
        let worst = cost_yocto(
            input_amount.0,
            output_amount.0,
            context_length,
            max_output,
            self.yocto_per_nano_usd,
        )
        .expect("worst case overflow");
        require!(worst > 0, "worst case is zero");
        self.model = Some(ModelPrice {
            model_id,
            input_amount: input_amount.0,
            output_amount: output_amount.0,
            scale,
            context_length,
            max_output,
            provider_type,
            verifiable,
        });
        env::log_str(&format!("TASKBOND model_frozen worst_case={worst}"));
    }

    pub fn set_operator(&mut self, operator: AccountId) {
        self.assert_owner();
        self.operator = operator;
    }

    pub fn set_guard(&mut self, guard: AccountId) {
        self.assert_owner();
        self.guard = guard;
    }

    pub fn set_reviewer(&mut self, reviewer: AccountId) {
        self.assert_owner();
        self.reviewer = reviewer;
    }

    #[payable]
    pub fn create_job(
        &mut self,
        title: String,
        topic: String,
        source_pack_hash: String,
        deadline_ns: U64,
    ) -> u64 {
        self.lock_params();
        require!(self.next_job_id <= MAX_JOBS, "job cap");
        require!(valid_text(&title, 1, MAX_TITLE), "title");
        require!(valid_text(&topic, 1, MAX_TOPIC), "topic");
        require!(is_hex64(&source_pack_hash), "source pack hash");
        let now = env::block_timestamp();
        require!(deadline_ns.0 > now, "deadline in the past");
        require!(deadline_ns.0 - now <= MAX_DEADLINE_WINDOW_NS, "deadline too far");
        let attached = env::attached_deposit().as_yoctonear();
        require!(attached >= JOB_STORAGE + MIN_REWARD, "deposit below min reward + storage");
        let reward = attached - JOB_STORAGE;
        let id = self.next_job_id;
        self.next_job_id += 1;
        let job = Job {
            id,
            poster: env::predecessor_account_id(),
            title,
            topic,
            job_type: "research_summary".to_string(),
            source_pack_hash,
            deadline_ns: deadline_ns.0,
            status: JobStatus::Open,
            escrow_amount: reward,
            escrow_claimable: reward,
            escrow_in_flight: 0,
            storage_stake: JOB_STORAGE,
            winner_agent_id: None,
            winner_owner: None,
            result_hash: None,
            evidence_hash: None,
            score: None,
            agent_count: 0,
        };
        self.jobs.insert(id, job);
        env::log_str(&format!(
            "TASKBOND job_created id={id} reward={reward} poster={}",
            env::predecessor_account_id()
        ));
        id
    }

    /// Poster cancel before any worker has submitted. Reward is refunded.
    /// Storage bond stays. Registration and guard decisions cannot call this.
    pub fn cancel_job(&mut self, job_id: u64) -> Promise {
        let job = self.job(job_id);
        require!(env::predecessor_account_id() == job.poster, "only poster");
        require!(matches!(job.status, JobStatus::Open), "job not open");
        require!(job.winner_agent_id.is_none(), "winner already set");
        require!(self.submission_count(job_id) == 0, "submissions exist");
        self.start_refund(job_id)
    }

    /// Anyone, after the deadline, when no winner was accepted.
    pub fn refund_expired(&mut self, job_id: u64) -> Promise {
        let job = self.job(job_id);
        require!(matches!(job.status, JobStatus::Open), "job not open");
        require!(job.winner_agent_id.is_none(), "winner already set");
        require!(env::block_timestamp() >= job.deadline_ns, "deadline not reached");
        self.start_refund(job_id)
    }

    #[payable]
    pub fn register_agent(&mut self, job_id: u64, name: String, prompt: String) -> u64 {
        self.lock_params();
        require!(valid_text(&name, 1, MAX_NAME), "name");
        require!(valid_prompt(&prompt), "prompt");
        let mut job = self.job(job_id);
        require!(matches!(job.status, JobStatus::Open), "job not open");
        require!(env::block_timestamp() < job.deadline_ns, "deadline passed");
        require!(job.agent_count < MAX_AGENTS_PER_JOB, "agent cap");
        let attached = env::attached_deposit().as_yoctonear();
        require!(
            attached > AGENT_STORAGE + GAS_RESERVE,
            "deposit must cover storage, gas reserve, and a cap"
        );
        let cap = attached - AGENT_STORAGE - GAS_RESERVE;
        let id = self.next_agent_id;
        self.next_agent_id += 1;
        let prompt_hash = sha256_hex(prompt.as_bytes());
        let agent = Agent {
            id,
            job_id,
            owner: env::predecessor_account_id(),
            name,
            prompt,
            prompt_hash,
            status: AgentStatus::PendingGuard,
            guard_reason: String::new(),
            cap,
            spent: 0,
            reserved: 0,
            unspent: cap,
            gas_reserve: GAS_RESERVE,
            storage_stake: AGENT_STORAGE,
            refund_locked: 0,
            gas_locked: 0,
            summary: String::new(),
            steps: Vec::new(),
            evidence: String::new(),
            result_hash: String::new(),
            evidence_hash: String::new(),
            review: ReviewState::None,
            review_reason: String::new(),
        };
        job.agent_count += 1;
        self.jobs.insert(job_id, job);
        self.agents.insert(id, agent);
        env::log_str(&format!(
            "TASKBOND agent_registered id={id} job={job_id} cap={cap} owner={}",
            env::predecessor_account_id()
        ));
        id
    }

    /// Guard signer records the decision. This method does not move escrow
    /// and does not pay anyone. Rejection leaves unspent deposit withdrawable
    /// once reservations are settled.
    pub fn record_guard(&mut self, agent_id: u64, approved: bool, reason: String) {
        require!(env::predecessor_account_id() == self.guard, "only guard");
        require!(valid_text(&reason, 1, MAX_REASON), "reason");
        let mut agent = self.agent(agent_id);
        require!(matches!(agent.status, AgentStatus::PendingGuard), "guard already recorded");
        agent.status = if approved { AgentStatus::Approved } else { AgentStatus::Rejected };
        agent.guard_reason = reason;
        let status = if approved { "approved" } else { "rejected" };
        env::log_str(&format!("TASKBOND guard agent={agent_id} status={status}"));
        self.agents.insert(agent_id, agent);
    }

    #[payable]
    pub fn fund_operator_budget(&mut self) {
        self.lock_params();
        require!(env::predecessor_account_id() == self.operator, "only operator");
        let attached = env::attached_deposit().as_yoctonear();
        require!(attached > 0, "empty deposit");
        self.operator_unspent = self.operator_unspent.checked_add(attached).expect("overflow");
        env::log_str(&format!("TASKBOND operator_funded amount={attached}"));
    }

    /// Reserve the frozen worst-case price before any NEAR AI call.
    /// The caller does not choose the amount. Replay of the same id and
    /// payer/purpose is a no-op. A reused id with different terms panics.
    pub fn reserve(&mut self, reservation_id: String, agent_id: u64, purpose: Purpose) {
        self.assert_operator();
        require!(valid_reservation_id(&reservation_id), "reservation id");
        let amount = self.worst_case_amount();
        if let Some(existing) = self.reservations.get(&reservation_id).cloned() {
            require!(existing.purpose == purpose, "reservation id replay");
            require!(existing.amount == amount, "reservation id replay");
            match purpose {
                Purpose::Reviewer => require!(existing.payer == PayerKind::Operator, "reservation id replay"),
                _ => {
                    require!(existing.payer == PayerKind::Agent, "reservation id replay");
                    require!(existing.agent_id == agent_id, "reservation id replay");
                }
            }
            env::log_str(&format!("TASKBOND reserve_replay id={reservation_id}"));
            return;
        }
        let now = env::block_timestamp();
        let (payer, stored_agent) = match purpose {
            Purpose::Reviewer => {
                require!(
                    self.operator_unspent >= amount,
                    "operator budget below worst-case reserve"
                );
                self.operator_unspent -= amount;
                self.operator_reserved = self.operator_reserved.checked_add(amount).expect("overflow");
                (PayerKind::Operator, 0)
            }
            Purpose::Guard | Purpose::Worker => {
                let mut agent = self.agent(agent_id);
                require!(agent.refund_locked == 0, "withdraw in flight");
                match purpose {
                    Purpose::Guard => require!(
                        matches!(agent.status, AgentStatus::PendingGuard),
                        "guard reserve only while pending"
                    ),
                    Purpose::Worker => require!(
                        matches!(agent.status, AgentStatus::Approved),
                        "worker reserve only after approval"
                    ),
                    Purpose::Reviewer => unreachable!(),
                }
                require!(agent.unspent >= amount, "cap exceeded");
                // spent + reserved + this amount <= cap, with cap = spent+reserved+unspent+refund_locked
                agent.unspent -= amount;
                agent.reserved = agent.reserved.checked_add(amount).expect("overflow");
                require!(agent.spent + agent.reserved <= agent.cap, "cap exceeded");
                self.agents.insert(agent_id, agent);
                (PayerKind::Agent, agent_id)
            }
        };
        self.reservations.insert(
            reservation_id.clone(),
            Reservation {
                id: reservation_id.clone(),
                payer,
                agent_id: stored_agent,
                purpose,
                amount,
                status: ReservationStatus::Reserved,
                created_at: now,
                expires_at: now + RESERVATION_TTL_NS,
                settled_input: 0,
                settled_output: 0,
                settled_cost: 0,
            },
        );
        env::log_str(&format!("TASKBOND reserved id={reservation_id} amount={amount}"));
    }

    pub fn settle(&mut self, reservation_id: String, input_tokens: u64, output_tokens: u64) {
        self.assert_operator();
        self.finish_reservation(reservation_id, input_tokens, output_tokens, false, false);
    }

    /// Expired reservations stay locked until the operator reconciles them.
    /// They are not auto-refunded. `release_all` clears the lock without a charge.
    pub fn reconcile(
        &mut self,
        reservation_id: String,
        input_tokens: u64,
        output_tokens: u64,
        release_all: bool,
    ) {
        self.assert_operator();
        self.finish_reservation(reservation_id, input_tokens, output_tokens, true, release_all);
    }

    pub fn submit_result(
        &mut self,
        agent_id: u64,
        summary: String,
        steps: Vec<String>,
        evidence: String,
    ) {
        require!(valid_text(&summary, 1, MAX_SUMMARY), "summary");
        require!(evidence.len() <= MAX_EVIDENCE && !evidence.is_empty(), "evidence");
        require!(!steps.is_empty() && steps.len() <= MAX_STEPS, "steps");
        for step in &steps {
            require!(valid_text(step, 1, MAX_STEP), "step");
        }
        let mut agent = self.agent(agent_id);
        require!(env::predecessor_account_id() == agent.owner, "only agent owner");
        require!(matches!(agent.status, AgentStatus::Approved), "agent not approved");
        require!(matches!(agent.review, ReviewState::None), "already submitted");
        let job = self.job(agent.job_id);
        require!(matches!(job.status, JobStatus::Open), "job not open");
        require!(env::block_timestamp() < job.deadline_ns, "deadline passed");
        agent.summary = summary;
        agent.steps = steps;
        agent.evidence = evidence;
        agent.result_hash = hash_result(&agent.summary, &agent.steps);
        agent.evidence_hash = sha256_hex(agent.evidence.as_bytes());
        agent.review = ReviewState::Pending;
        env::log_str(&format!(
            "TASKBOND submitted agent={agent_id} result={} evidence={}",
            agent.result_hash, agent.evidence_hash
        ));
        self.agents.insert(agent_id, agent);
    }

    /// Reviewer binds the stored hashes and the fixed agent owner.
    /// Accepting does not transfer NEAR. Payout is a separate call.
    pub fn record_review(
        &mut self,
        agent_id: u64,
        result_hash: String,
        evidence_hash: String,
        score: u8,
        accept: bool,
        reason: String,
    ) {
        require!(env::predecessor_account_id() == self.reviewer, "only reviewer");
        require!((0..=100).contains(&score), "score");
        require!(valid_text(&reason, 1, MAX_REASON), "reason");
        let mut agent = self.agent(agent_id);
        require!(matches!(agent.review, ReviewState::Pending), "nothing to review");
        require!(agent.result_hash == result_hash, "result hash mismatch");
        require!(agent.evidence_hash == evidence_hash, "evidence hash mismatch");
        let mut job = self.job(agent.job_id);
        require!(matches!(job.status, JobStatus::Open), "job not open");
        require!(job.winner_agent_id.is_none(), "winner already set");
        agent.review_reason = reason;
        if accept {
            agent.review = ReviewState::Accepted;
            job.winner_agent_id = Some(agent.id);
            job.winner_owner = Some(agent.owner.clone());
            job.result_hash = Some(agent.result_hash.clone());
            job.evidence_hash = Some(agent.evidence_hash.clone());
            job.score = Some(score);
            env::log_str(&format!(
                "TASKBOND review_accept job={} agent={} owner={} score={score}",
                job.id, agent.id, agent.owner
            ));
        } else {
            agent.review = ReviewState::Rejected;
            env::log_str(&format!("TASKBOND review_reject agent={agent_id} score={score}"));
        }
        let job_id = job.id;
        self.jobs.insert(job_id, job);
        self.agents.insert(agent_id, agent);
    }

    /// Schedules the reward transfer. Paid is set only in the success callback.
    pub fn payout_winner(&mut self, job_id: u64) -> Promise {
        let mut job = self.job(job_id);
        require!(matches!(job.status, JobStatus::Open), "job not payable");
        let owner = job.winner_owner.clone().expect("no winner");
        let agent_id = job.winner_agent_id.expect("no winner");
        require!(job.escrow_claimable == job.escrow_amount, "escrow already moved");
        require!(job.escrow_claimable > 0, "empty escrow");
        let amount = job.escrow_claimable;
        job.escrow_claimable = 0;
        job.escrow_in_flight = amount;
        job.status = JobStatus::PayoutInFlight;
        self.jobs.insert(job_id, job);
        env::log_str(&format!("TASKBOND payout_scheduled job={job_id} to={owner} amount={amount}"));
        self.transfer_then(TransferKind::Payout, job_id, agent_id, owner, amount)
    }

    pub fn withdraw_agent(&mut self, agent_id: u64) -> Promise {
        let mut agent = self.agent(agent_id);
        require!(env::predecessor_account_id() == agent.owner, "only agent owner");
        require!(agent.refund_locked == 0 && agent.gas_locked == 0, "withdraw in flight");
        require!(agent.reserved == 0, "reservations outstanding");
        let job = self.job(agent.job_id);
        let terminal = matches!(agent.status, AgentStatus::Rejected)
            || matches!(job.status, JobStatus::Paid | JobStatus::Refunded);
        require!(terminal, "withdraw after rejection or job end");
        let unspent = agent.unspent;
        let gas = agent.gas_reserve;
        let amount = unspent + gas;
        require!(amount > 0, "nothing to withdraw");
        let job_id = agent.job_id;
        let owner = agent.owner.clone();
        agent.unspent = 0;
        agent.gas_reserve = 0;
        agent.refund_locked = unspent;
        agent.gas_locked = gas;
        self.agents.insert(agent_id, agent);
        env::log_str(&format!("TASKBOND withdraw_scheduled agent={agent_id} amount={amount}"));
        self.transfer_then(TransferKind::AgentWithdraw, job_id, agent_id, owner, amount)
    }

    pub fn withdraw_reimbursement(&mut self, amount: U128) -> Promise {
        self.assert_operator();
        require!(amount.0 > 0, "empty");
        require!(self.accrued_reimbursement >= amount.0, "insufficient reimbursement");
        self.accrued_reimbursement -= amount.0;
        self.reimbursement_in_flight = self
            .reimbursement_in_flight
            .checked_add(amount.0)
            .expect("overflow");
        env::log_str(&format!("TASKBOND reimbursement_scheduled amount={}", amount.0));
        self.transfer_then(
            TransferKind::Reimbursement,
            0,
            0,
            self.operator.clone(),
            amount.0,
        )
    }

    pub fn withdraw_operator_unspent(&mut self, amount: U128) -> Promise {
        self.assert_operator();
        require!(amount.0 > 0 && self.operator_unspent >= amount.0, "insufficient operator budget");
        require!(self.operator_refund_locked == 0, "operator withdraw in flight");
        self.operator_unspent -= amount.0;
        self.operator_refund_locked = amount.0;
        env::log_str(&format!("TASKBOND operator_withdraw_scheduled amount={}", amount.0));
        self.transfer_then(
            TransferKind::OperatorWithdraw,
            0,
            0,
            self.operator.clone(),
            amount.0,
        )
    }

    #[private]
    pub fn on_transfer(
        &mut self,
        kind: TransferKind,
        job_id: u64,
        agent_id: u64,
        payee: AccountId,
        amount: U128,
        #[callback_result] result: Result<(), PromiseError>,
    ) {
        let ok = result.is_ok();
        match kind {
            TransferKind::Payout | TransferKind::Refund => {
                let mut job = self.job(job_id);
                require!(job.escrow_in_flight == amount.0, "in-flight mismatch");
                require!(
                    matches!(
                        job.status,
                        JobStatus::PayoutInFlight | JobStatus::RefundInFlight
                    ),
                    "not in flight"
                );
                if kind == TransferKind::Payout {
                    require!(job.winner_owner.as_ref() == Some(&payee), "payee mismatch");
                } else {
                    require!(job.poster == payee, "payee mismatch");
                }
                if ok {
                    job.escrow_in_flight = 0;
                    job.status = if kind == TransferKind::Payout {
                        env::log_str(&format!("TASKBOND payout_confirmed job={job_id} amount={}", amount.0));
                        JobStatus::Paid
                    } else {
                        env::log_str(&format!("TASKBOND refund_confirmed job={job_id} amount={}", amount.0));
                        JobStatus::Refunded
                    };
                } else {
                    job.escrow_claimable = amount.0;
                    job.escrow_in_flight = 0;
                    job.status = JobStatus::Open;
                    env::log_str(&format!(
                        "TASKBOND transfer_restored kind={kind:?} job={job_id} amount={}",
                        amount.0
                    ));
                }
                self.jobs.insert(job_id, job);
            }
            TransferKind::AgentWithdraw => {
                let mut agent = self.agent(agent_id);
                require!(agent.owner == payee, "payee mismatch");
                require!(agent.refund_locked + agent.gas_locked == amount.0, "in-flight mismatch");
                if ok {
                    agent.refund_locked = 0;
                    agent.gas_locked = 0;
                    env::log_str(&format!("TASKBOND withdraw_confirmed agent={agent_id} amount={}", amount.0));
                } else {
                    agent.unspent = agent.unspent.checked_add(agent.refund_locked).expect("overflow");
                    agent.gas_reserve = agent.gas_reserve.checked_add(agent.gas_locked).expect("overflow");
                    agent.refund_locked = 0;
                    agent.gas_locked = 0;
                    env::log_str(&format!("TASKBOND withdraw_restored agent={agent_id} amount={}", amount.0));
                }
                self.agents.insert(agent_id, agent);
            }
            TransferKind::Reimbursement => {
                require!(self.reimbursement_in_flight >= amount.0, "in-flight mismatch");
                require!(payee == self.operator, "payee mismatch");
                self.reimbursement_in_flight -= amount.0;
                if ok {
                    env::log_str(&format!("TASKBOND reimbursement_confirmed amount={}", amount.0));
                } else {
                    self.accrued_reimbursement =
                        self.accrued_reimbursement.checked_add(amount.0).expect("overflow");
                    env::log_str(&format!("TASKBOND reimbursement_restored amount={}", amount.0));
                }
            }
            TransferKind::OperatorWithdraw => {
                require!(self.operator_refund_locked == amount.0, "in-flight mismatch");
                require!(payee == self.operator, "payee mismatch");
                self.operator_refund_locked = 0;
                if ok {
                    env::log_str(&format!("TASKBOND operator_withdraw_confirmed amount={}", amount.0));
                } else {
                    self.operator_unspent = self.operator_unspent.checked_add(amount.0).expect("overflow");
                    env::log_str(&format!("TASKBOND operator_withdraw_restored amount={}", amount.0));
                }
            }
        }
    }

    pub fn get_job(&self, job_id: u64) -> Option<JobView> {
        self.jobs.get(&job_id).map(JobView::from_job)
    }

    pub fn list_jobs(&self) -> Vec<JobView> {
        self.jobs.values().map(JobView::from_job).collect()
    }

    pub fn get_agent(&self, agent_id: u64) -> Option<AgentView> {
        self.agents.get(&agent_id).map(AgentView::from_agent)
    }

    pub fn list_agents(&self, job_id: u64) -> Vec<AgentView> {
        self.agents
            .values()
            .filter(|agent| agent.job_id == job_id)
            .map(AgentView::from_agent)
            .collect()
    }

    pub fn get_reservation(&self, reservation_id: String) -> Option<ReservationView> {
        self.reservations.get(&reservation_id).map(ReservationView::from_reservation)
    }

    pub fn get_config(&self) -> ConfigView {
        ConfigView {
            owner: self.owner.clone(),
            operator: self.operator.clone(),
            guard: self.guard.clone(),
            reviewer: self.reviewer.clone(),
            yocto_per_nano_usd: U128(self.yocto_per_nano_usd),
            model: self.model.as_ref().map(ModelView::from_model),
            params_locked: self.params_locked,
            worst_case: U128(self.model.as_ref().map(|_| self.worst_case_amount()).unwrap_or(0)),
            job_storage: U128(JOB_STORAGE),
            agent_storage: U128(AGENT_STORAGE),
            gas_reserve: U128(GAS_RESERVE),
            min_reward: U128(MIN_REWARD),
            reservation_ttl_ns: U64(RESERVATION_TTL_NS),
            operator_unspent: U128(self.operator_unspent),
            operator_reserved: U128(self.operator_reserved),
            operator_spent: U128(self.operator_spent),
            accrued_reimbursement: U128(self.accrued_reimbursement),
            reimbursement_in_flight: U128(self.reimbursement_in_flight),
            now: U64(env::block_timestamp()),
        }
    }

    pub fn quote_cost(&self, input_tokens: u64, output_tokens: u64) -> U128 {
        let model = self.model.as_ref().expect("model not frozen");
        require!(input_tokens <= model.context_length, "input above frozen ceiling");
        require!(output_tokens <= model.max_output, "output above frozen ceiling");
        U128(
            cost_yocto(
                model.input_amount,
                model.output_amount,
                input_tokens,
                output_tokens,
                self.yocto_per_nano_usd,
            )
            .expect("quote overflow"),
        )
    }

    pub fn get_liabilities(&self) -> U128 {
        U128(self.liabilities())
    }

    fn start_refund(&mut self, job_id: u64) -> Promise {
        let mut job = self.job(job_id);
        let amount = job.escrow_claimable;
        require!(amount > 0, "nothing to refund");
        let poster = job.poster.clone();
        job.escrow_claimable = 0;
        job.escrow_in_flight = amount;
        job.status = JobStatus::RefundInFlight;
        self.jobs.insert(job_id, job);
        env::log_str(&format!("TASKBOND refund_scheduled job={job_id} to={poster} amount={amount}"));
        self.transfer_then(TransferKind::Refund, job_id, 0, poster, amount)
    }

    fn transfer_then(
        &self,
        kind: TransferKind,
        job_id: u64,
        agent_id: u64,
        payee: AccountId,
        amount: u128,
    ) -> Promise {
        Promise::new(payee.clone())
            .transfer(NearToken::from_yoctonear(amount))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(CALLBACK_GAS)
                    .on_transfer(kind, job_id, agent_id, payee, U128(amount)),
            )
    }

    fn finish_reservation(
        &mut self,
        reservation_id: String,
        input_tokens: u64,
        output_tokens: u64,
        expired_path: bool,
        release_all: bool,
    ) {
        let mut reservation = self
            .reservations
            .get(&reservation_id)
            .cloned()
            .expect("unknown reservation");
        if matches!(
            reservation.status,
            ReservationStatus::Settled | ReservationStatus::Reconciled
        ) {
            require!(!release_all, "settle replay mismatch");
            require!(reservation.settled_input == input_tokens, "settle replay mismatch");
            require!(reservation.settled_output == output_tokens, "settle replay mismatch");
            env::log_str(&format!("TASKBOND settle_replay id={reservation_id}"));
            return;
        }
        let now = env::block_timestamp();
        if expired_path {
            require!(now > reservation.expires_at, "not expired");
        } else {
            require!(now <= reservation.expires_at, "reservation expired; reconcile");
        }
        let cost = if release_all {
            require!(expired_path, "release only via reconcile");
            0
        } else {
            let model = self.model.clone().expect("model not frozen");
            require!(input_tokens <= model.context_length, "input above frozen ceiling");
            require!(output_tokens <= model.max_output, "output above frozen ceiling");
            let cost = cost_yocto(
                model.input_amount,
                model.output_amount,
                input_tokens,
                output_tokens,
                self.yocto_per_nano_usd,
            )
            .expect("settle overflow");
            require!(cost <= reservation.amount, "settle above reservation");
            cost
        };
        let refund = reservation.amount - cost;
        match reservation.payer {
            PayerKind::Agent => {
                let mut agent = self.agent(reservation.agent_id);
                require!(agent.reserved >= reservation.amount, "reserved underflow");
                agent.reserved -= reservation.amount;
                agent.unspent = agent.unspent.checked_add(refund).expect("overflow");
                agent.spent = agent.spent.checked_add(cost).expect("overflow");
                require!(agent.spent + agent.reserved + agent.unspent + agent.refund_locked == agent.cap, "cap invariant");
                self.agents.insert(reservation.agent_id, agent);
            }
            PayerKind::Operator => {
                require!(self.operator_reserved >= reservation.amount, "reserved underflow");
                self.operator_reserved -= reservation.amount;
                self.operator_unspent = self.operator_unspent.checked_add(refund).expect("overflow");
                self.operator_spent = self.operator_spent.checked_add(cost).expect("overflow");
            }
        }
        self.accrued_reimbursement = self.accrued_reimbursement.checked_add(cost).expect("overflow");
        reservation.settled_input = input_tokens;
        reservation.settled_output = output_tokens;
        reservation.settled_cost = cost;
        reservation.status = if expired_path {
            ReservationStatus::Reconciled
        } else {
            ReservationStatus::Settled
        };
        env::log_str(&format!("TASKBOND settled id={reservation_id} cost={cost} released={refund}"));
        self.reservations.insert(reservation_id, reservation);
    }

    fn worst_case_amount(&self) -> u128 {
        let model = self.model.as_ref().expect("model not frozen");
        cost_yocto(
            model.input_amount,
            model.output_amount,
            model.context_length,
            model.max_output,
            self.yocto_per_nano_usd,
        )
        .expect("worst case overflow")
    }

    fn lock_params(&mut self) {
        require!(self.model.is_some(), "freeze model first");
        require!(self.yocto_per_nano_usd > 0, "set rate first");
        self.params_locked = true;
    }

    fn liabilities(&self) -> u128 {
        let mut total = 0u128;
        for job in self.jobs.values() {
            total = total.checked_add(job.storage_stake).expect("overflow");
            total = total.checked_add(job.escrow_claimable).expect("overflow");
            total = total.checked_add(job.escrow_in_flight).expect("overflow");
        }
        for agent in self.agents.values() {
            total = total.checked_add(agent.storage_stake).expect("overflow");
            total = total.checked_add(agent.gas_reserve).expect("overflow");
            total = total.checked_add(agent.gas_locked).expect("overflow");
            total = total.checked_add(agent.unspent).expect("overflow");
            total = total.checked_add(agent.reserved).expect("overflow");
            total = total.checked_add(agent.refund_locked).expect("overflow");
            // spent has moved into accrued_reimbursement
        }
        total = total.checked_add(self.operator_unspent).expect("overflow");
        total = total.checked_add(self.operator_reserved).expect("overflow");
        total = total.checked_add(self.operator_refund_locked).expect("overflow");
        total = total.checked_add(self.accrued_reimbursement).expect("overflow");
        total = total.checked_add(self.reimbursement_in_flight).expect("overflow");
        total
    }

    fn submission_count(&self, job_id: u64) -> usize {
        self.agents
            .values()
            .filter(|agent| agent.job_id == job_id && agent.review != ReviewState::None)
            .count()
    }

    fn job(&self, job_id: u64) -> Job {
        self.jobs.get(&job_id).cloned().expect("unknown job")
    }

    fn agent(&self, agent_id: u64) -> Agent {
        self.agents.get(&agent_id).cloned().expect("unknown agent")
    }

    fn assert_owner(&self) {
        require!(env::predecessor_account_id() == self.owner, "only owner");
    }

    fn assert_operator(&self) {
        require!(env::predecessor_account_id() == self.operator, "only operator");
    }
}

#[near(serializers = [json])]
pub struct ModelView {
    pub model_id: String,
    pub input_amount: U128,
    pub output_amount: U128,
    pub scale: u32,
    pub context_length: U64,
    pub max_output: U64,
    pub provider_type: String,
    pub verifiable: bool,
}

impl ModelView {
    fn from_model(model: &ModelPrice) -> Self {
        Self {
            model_id: model.model_id.clone(),
            input_amount: U128(model.input_amount),
            output_amount: U128(model.output_amount),
            scale: model.scale,
            context_length: U64(model.context_length),
            max_output: U64(model.max_output),
            provider_type: model.provider_type.clone(),
            verifiable: model.verifiable,
        }
    }
}

#[near(serializers = [json])]
pub struct JobView {
    pub id: u64,
    pub poster: AccountId,
    pub title: String,
    pub topic: String,
    pub job_type: String,
    pub source_pack_hash: String,
    pub deadline_ns: U64,
    pub status: JobStatus,
    pub escrow_amount: U128,
    pub escrow_claimable: U128,
    pub escrow_in_flight: U128,
    pub storage_stake: U128,
    pub winner_agent_id: Option<u64>,
    pub winner_owner: Option<AccountId>,
    pub result_hash: Option<String>,
    pub evidence_hash: Option<String>,
    pub score: Option<u8>,
    pub agent_count: u64,
}

impl JobView {
    fn from_job(job: &Job) -> Self {
        Self {
            id: job.id,
            poster: job.poster.clone(),
            title: job.title.clone(),
            topic: job.topic.clone(),
            job_type: job.job_type.clone(),
            source_pack_hash: job.source_pack_hash.clone(),
            deadline_ns: U64(job.deadline_ns),
            status: job.status.clone(),
            escrow_amount: U128(job.escrow_amount),
            escrow_claimable: U128(job.escrow_claimable),
            escrow_in_flight: U128(job.escrow_in_flight),
            storage_stake: U128(job.storage_stake),
            winner_agent_id: job.winner_agent_id,
            winner_owner: job.winner_owner.clone(),
            result_hash: job.result_hash.clone(),
            evidence_hash: job.evidence_hash.clone(),
            score: job.score,
            agent_count: job.agent_count,
        }
    }
}

#[near(serializers = [json])]
pub struct AgentView {
    pub id: u64,
    pub job_id: u64,
    pub owner: AccountId,
    pub name: String,
    pub prompt: String,
    pub prompt_hash: String,
    pub status: AgentStatus,
    pub guard_reason: String,
    pub cap: U128,
    pub spent: U128,
    pub reserved: U128,
    pub unspent: U128,
    pub gas_reserve: U128,
    pub storage_stake: U128,
    pub refund_locked: U128,
    pub gas_locked: U128,
    pub summary: String,
    pub steps: Vec<String>,
    pub evidence: String,
    pub result_hash: String,
    pub evidence_hash: String,
    pub review: ReviewState,
    pub review_reason: String,
}

impl AgentView {
    fn from_agent(agent: &Agent) -> Self {
        Self {
            id: agent.id,
            job_id: agent.job_id,
            owner: agent.owner.clone(),
            name: agent.name.clone(),
            prompt: agent.prompt.clone(),
            prompt_hash: agent.prompt_hash.clone(),
            status: agent.status.clone(),
            guard_reason: agent.guard_reason.clone(),
            cap: U128(agent.cap),
            spent: U128(agent.spent),
            reserved: U128(agent.reserved),
            unspent: U128(agent.unspent),
            gas_reserve: U128(agent.gas_reserve),
            storage_stake: U128(agent.storage_stake),
            refund_locked: U128(agent.refund_locked),
            gas_locked: U128(agent.gas_locked),
            summary: agent.summary.clone(),
            steps: agent.steps.clone(),
            evidence: agent.evidence.clone(),
            result_hash: agent.result_hash.clone(),
            evidence_hash: agent.evidence_hash.clone(),
            review: agent.review.clone(),
            review_reason: agent.review_reason.clone(),
        }
    }
}

#[near(serializers = [json])]
pub struct ReservationView {
    pub id: String,
    pub payer: PayerKind,
    pub agent_id: u64,
    pub purpose: Purpose,
    pub amount: U128,
    pub status: ReservationStatus,
    pub created_at: U64,
    pub expires_at: U64,
    pub settled_input: u64,
    pub settled_output: u64,
    pub settled_cost: U128,
}

impl ReservationView {
    fn from_reservation(reservation: &Reservation) -> Self {
        Self {
            id: reservation.id.clone(),
            payer: reservation.payer.clone(),
            agent_id: reservation.agent_id,
            purpose: reservation.purpose.clone(),
            amount: U128(reservation.amount),
            status: reservation.status.clone(),
            created_at: U64(reservation.created_at),
            expires_at: U64(reservation.expires_at),
            settled_input: reservation.settled_input,
            settled_output: reservation.settled_output,
            settled_cost: U128(reservation.settled_cost),
        }
    }
}

#[near(serializers = [json])]
pub struct ConfigView {
    pub owner: AccountId,
    pub operator: AccountId,
    pub guard: AccountId,
    pub reviewer: AccountId,
    pub yocto_per_nano_usd: U128,
    pub model: Option<ModelView>,
    pub params_locked: bool,
    pub worst_case: U128,
    pub job_storage: U128,
    pub agent_storage: U128,
    pub gas_reserve: U128,
    pub min_reward: U128,
    pub reservation_ttl_ns: U64,
    pub operator_unspent: U128,
    pub operator_reserved: U128,
    pub operator_spent: U128,
    pub accrued_reimbursement: U128,
    pub reimbursement_in_flight: U128,
    pub now: U64,
}

fn hash_result(summary: &str, steps: &[String]) -> String {
    let mut buf = Vec::new();
    push_len_bytes(&mut buf, summary.as_bytes());
    buf.extend_from_slice(&(steps.len() as u32).to_le_bytes());
    for step in steps {
        push_len_bytes(&mut buf, step.as_bytes());
    }
    sha256_hex(&buf)
}

fn push_len_bytes(buf: &mut Vec<u8>, bytes: &[u8]) {
    buf.extend_from_slice(&(bytes.len() as u32).to_le_bytes());
    buf.extend_from_slice(bytes);
}

fn sha256_hex(bytes: &[u8]) -> String {
    hex_encode(&env::sha256(bytes))
}

fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0xf) as usize] as char);
    }
    out
}

fn is_hex64(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

fn valid_reservation_id(value: &str) -> bool {
    (8..=80).contains(&value.len())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b':' || byte == b'_' || byte == b'-')
}

fn valid_text(value: &str, min: usize, max: usize) -> bool {
    value.len() >= min && value.len() <= max && value.chars().all(|ch| ch == '\n' || ch == '\t' || !ch.is_control())
}

fn valid_prompt(value: &str) -> bool {
    valid_text(value, 1, MAX_PROMPT)
}
