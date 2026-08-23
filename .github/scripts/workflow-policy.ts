/**
 * Shared parsing and policy checks for GitHub Actions workflow files.
 *
 * Used by `bun run audit:workflows` (the CI-facing audit script) and by the
 * `test:workflow-authorization`, `test:workflow-prompt-injection`, and
 * `test:production-migration-gate` suites, so the audit and the tests can
 * never silently drift apart.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const WORKFLOWS_DIRECTORY = join(import.meta.dirname, '..', 'workflows');

// Events whose payload text is authored by, or whose base-repo execution
// context is reachable by, an untrusted party (any GitHub user, not just
// repository collaborators). Bare `pull_request` is deliberately excluded:
// GitHub itself withholds repository secrets and grants only a read-only
// `GITHUB_TOKEN` to `pull_request` runs triggered from a fork, so a job on
// that trigger cannot leak a secret it was never handed. `pull_request_target`
// has no such protection (it runs with base-repo secrets even for fork
// PRs), so it stays untrusted.
const UNTRUSTED_EVENTS = new Set([
	'issue_comment',
	'pull_request_review_comment',
	'issues',
	'pull_request_target',
]);

const FULL_COMMIT_SHA = /^[0-9a-f]{40}$/;

export interface WorkflowStep {
	name?: string;
	uses?: string;
	run?: string;
	with?: Record<string, unknown>;
	env?: Record<string, unknown>;
	if?: string;
}

export interface WorkflowJob {
	name?: string;
	if?: string;
	needs?: string | string[];
	permissions?: Record<string, string> | string;
	environment?: string | { name: string };
	'timeout-minutes'?: number;
	concurrency?: unknown;
	secrets?: unknown;
	env?: Record<string, unknown>;
	steps?: WorkflowStep[];
}

export interface Workflow {
	name?: string;
	on?: unknown;
	permissions?: Record<string, string> | string;
	concurrency?: unknown;
	jobs: Record<string, WorkflowJob>;
}

export interface WorkflowFile {
	fileName: string;
	path: string;
	raw: string;
	workflow: Workflow;
}

export interface Violation {
	fileName: string;
	rule: string;
	message: string;
}

export function listWorkflowFiles(): string[] {
	return readdirSync(WORKFLOWS_DIRECTORY)
		.filter((entry) => entry.endsWith('.yml') || entry.endsWith('.yaml'))
		.sort();
}

export function loadWorkflow(fileName: string): WorkflowFile {
	const path = join(WORKFLOWS_DIRECTORY, fileName);
	const raw = readFileSync(path, 'utf8');
	const workflow = Bun.YAML.parse(raw) as Workflow;
	return { fileName, path, raw, workflow };
}

export function loadAllWorkflows(): WorkflowFile[] {
	return listWorkflowFiles().map(loadWorkflow);
}

/** Every event name this workflow's `on:` trigger listens for. */
export function triggerEvents(workflow: Workflow): string[] {
	const on = workflow.on;
	if (typeof on === 'string') return [on];
	if (Array.isArray(on)) return on.map(String);
	if (on && typeof on === 'object') return Object.keys(on as Record<string, unknown>);
	return [];
}

export function isUntrustedTriggered(workflow: Workflow): boolean {
	return triggerEvents(workflow).some((event) => UNTRUSTED_EVENTS.has(event));
}

/** All `uses:` action references across every job/step in a workflow. */
export function actionReferences(workflow: Workflow): string[] {
	const references: string[] = [];
	for (const job of Object.values(workflow.jobs ?? {})) {
		for (const step of job.steps ?? []) {
			if (step.uses) references.push(step.uses);
		}
	}
	return references;
}

export function isPinnedToCommitSha(reference: string): boolean {
	const at = reference.lastIndexOf('@');
	if (at === -1) return false;
	return FULL_COMMIT_SHA.test(reference.slice(at + 1));
}

/** True if a job declares any permission above `read` (including `write-all`). */
export function jobGrantsWrite(job: WorkflowJob): boolean {
	if (!job.permissions) return false;
	if (typeof job.permissions === 'string') {
		return job.permissions === 'write-all';
	}
	return Object.values(job.permissions).some((level) => level === 'write');
}

/** True if any step in the job references `secrets.` (excluding `secrets: inherit`). */
export function jobUsesSecrets(job: WorkflowJob): boolean {
	if (job.secrets) return true;
	const haystacks: string[] = [];
	if (job.env) haystacks.push(JSON.stringify(job.env));
	for (const step of job.steps ?? []) {
		if (step.with) haystacks.push(JSON.stringify(step.with));
		if (step.env) haystacks.push(JSON.stringify(step.env));
		if (step.run) haystacks.push(step.run);
	}
	return haystacks.some((text) => /\bsecrets\./.test(text));
}

/** The `needs:` job names for a job, normalized to an array. */
export function jobNeeds(job: WorkflowJob): string[] {
	if (!job.needs) return [];
	return Array.isArray(job.needs) ? job.needs : [job.needs];
}

/**
 * `job.if` must equal (never merely reference) a positive authorization
 * output — `needs.<upstreamJobName>.outputs.<outputName> == '<approvedValue>'`
 * — where `<upstreamJobName>` is one of the job's own `needs:` entries.
 *
 * Review finding (P2): the previous check, `/needs\.\w*(authoriz)/i`, was a
 * bare substring match against the whole `if:` string. Two ways that let an
 * unauthorized job through the audit as "gated":
 *
 * - It never anchored the matched name to `needs:` — `needs.not_authorized`
 *   (an unrelated job name that merely contains "authoriz" as a substring)
 *   satisfied it, even if `not_authorized` is not one of this job's `needs:`
 *   entries at all.
 * - It never inspected the comparison operator or the compared value — a
 *   condition like `needs.authorize.outputs.authorized != 'true'` (the
 *   negation: this job runs precisely when authorization was REJECTED)
 *   matched identically to the correct `== 'true'` form, because the regex
 *   only checked that the output name appeared somewhere in the string.
 */
const POSITIVE_AUTHORIZATION_CONDITION =
	/needs\.([A-Za-z0-9_-]+)\.outputs\.[A-Za-z0-9_-]+\s*==\s*['"]true['"]/;

/**
 * A job is authorization-gated when its `if:` requires equality against a
 * positive (`'true'`) authorization output from a job actually named in its
 * own `needs:`, so it cannot run for an actor the authorization job
 * rejected — and cannot be satisfied by a same-named-but-unrelated output,
 * a negated condition, or a job outside its own `needs:` chain.
 */
export function isAuthorizationGated(workflow: Workflow, jobName: string): boolean {
	const job = workflow.jobs[jobName];
	if (!job) return false;

	const needs = jobNeeds(job);
	if (needs.length === 0) return false;

	const match = POSITIVE_AUTHORIZATION_CONDITION.exec(job.if ?? '');
	if (!match) return false;

	// The job the condition actually reads from must be one this job
	// genuinely `needs:` — a positive condition referencing some other,
	// unrelated job's output would not actually gate this job's execution
	// on anything this job depends on.
	const referencedJobName = match[1];
	if (!needs.includes(referencedJobName)) return false;

	// The upstream job it depends on must itself hold no write permissions
	// and no secrets, or the "gate" grants nothing.
	return needs.every((upstream) => {
		const upstreamJob = workflow.jobs[upstream];
		return (
			upstreamJob !== undefined && !jobGrantsWrite(upstreamJob) && !jobUsesSecrets(upstreamJob)
		);
	});
}

export function auditWorkflows(): Violation[] {
	const violations: Violation[] = [];

	for (const { fileName, workflow } of loadAllWorkflows()) {
		if (workflow.permissions === undefined) {
			violations.push({
				fileName,
				rule: 'top-level-permissions',
				message:
					'Workflow has no top-level `permissions:` block. Add an explicit (possibly empty) grant.',
			});
		}

		for (const reference of actionReferences(workflow)) {
			if (!isPinnedToCommitSha(reference)) {
				violations.push({
					fileName,
					rule: 'pinned-action',
					message: `Action "${reference}" is not pinned to a full 40-character commit SHA.`,
				});
			}
		}

		for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
			if (job['timeout-minutes'] === undefined) {
				violations.push({
					fileName,
					rule: 'job-timeout',
					message: `Job "${jobName}" has no \`timeout-minutes\`.`,
				});
			}

			if (job.permissions === undefined) {
				violations.push({
					fileName,
					rule: 'job-permissions',
					message: `Job "${jobName}" has no explicit \`permissions:\`.`,
				});
			}
		}

		if (workflow.concurrency === undefined) {
			violations.push({
				fileName,
				rule: 'concurrency',
				message: 'Workflow has no `concurrency:` group, so overlapping runs are not serialized.',
			});
		}

		if (isUntrustedTriggered(workflow)) {
			for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
				const privileged = jobGrantsWrite(job) || jobUsesSecrets(job);
				if (privileged && !isAuthorizationGated(workflow, jobName)) {
					violations.push({
						fileName,
						rule: 'untrusted-privileged-job',
						message: `Job "${jobName}" holds write permissions or secrets on an untrusted-content trigger without a secret-free, read-only authorization gate in its \`needs:\` chain.`,
					});
				}
			}
		}
	}

	return violations;
}

export function formatViolations(violations: Violation[]): string {
	return violations.map((v) => `${v.fileName}: [${v.rule}] ${v.message}`).join('\n');
}

// Expression fragments that name attacker-controlled text (an issue title
// or body, a comment body, a review body, or a branch/head ref an attacker
// names). Interpolating any of these directly into a `run:` shell block
// (rather than passing them through `env:` and referencing the environment
// variable) lets the attacker's text execute as shell syntax.
const UNTRUSTED_EXPRESSION_FRAGMENTS = [
	'github.event.issue.title',
	'github.event.issue.body',
	'github.event.comment.body',
	'github.event.review.body',
	'github.event.pull_request.title',
	'github.event.pull_request.body',
	'github.head_ref',
];

interface RunBlock {
	jobName: string;
	stepIndex: number;
	script: string;
}

function collectRunBlocks(workflow: Workflow): RunBlock[] {
	const blocks: RunBlock[] = [];
	for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
		(job.steps ?? []).forEach((step, stepIndex) => {
			if (typeof step.run === 'string') {
				blocks.push({ jobName, stepIndex, script: step.run });
			}
		});
	}
	return blocks;
}

/**
 * Finds `run:` steps that interpolate attacker-controlled text directly as
 * shell syntax via `${{ ... }}`, instead of passing it through `env:`.
 */
export function findUnsafeExpressionInterpolation(workflow: Workflow): Violation[] {
	const violations: Violation[] = [];
	for (const block of collectRunBlocks(workflow)) {
		for (const fragment of UNTRUSTED_EXPRESSION_FRAGMENTS) {
			if (block.script.includes(`\${{ ${fragment}`) || block.script.includes(`\${{${fragment}`)) {
				violations.push({
					fileName: `${block.jobName}[${block.stepIndex}]`,
					rule: 'unsafe-run-interpolation',
					message: `run: step interpolates "${fragment}" directly; pass it through env: instead.`,
				});
			}
		}
	}
	return violations;
}
