import { describe, expect, test } from 'bun:test';
import {
	actionReferences,
	isAuthorizationGated,
	isPinnedToCommitSha,
	jobGrantsWrite,
	jobUsesSecrets,
	loadWorkflow,
} from '../scripts/workflow-policy';

describe('claude.yml: comment-triggered automation authorization', () => {
	const { workflow } = loadWorkflow('claude.yml');

	test('the top-level workflow grants no default permissions', () => {
		expect(workflow.permissions).toEqual({});
	});

	test('an `authorize` job exists and holds neither write permissions nor secrets', () => {
		const authorize = workflow.jobs.authorize;
		expect(authorize).toBeDefined();
		expect(jobGrantsWrite(authorize)).toBe(false);
		expect(jobUsesSecrets(authorize)).toBe(false);
	});

	test("the authorize job checks the actor's live GitHub permission level, not event text", () => {
		const authorize = workflow.jobs.authorize;
		const script = authorize.steps?.map((step) => JSON.stringify(step.with ?? {})).join('\n');
		expect(script).toMatch(/getCollaboratorPermissionLevel/);
	});

	test('the authorize job fails closed when permission lookup errors', () => {
		const authorize = workflow.jobs.authorize;
		const script = authorize.steps?.map((step) => String(step.with?.script ?? '')).join('\n') ?? '';
		expect(script).toMatch(/catch/);
		// The default `permission` value must not itself satisfy the
		// authorized check ("admin" or "write").
		expect(script).toMatch(/permission = 'none'/);
	});

	test('excludes bot actors before any permission check runs', () => {
		const authorize = workflow.jobs.authorize;
		expect(authorize.if).toMatch(/Bot/);
		expect(authorize.if).toMatch(/\[bot\]/);
	});

	test('the write-capable `claude` job runs only after `authorize` succeeds', () => {
		const claude = workflow.jobs.claude;
		expect(claude).toBeDefined();
		expect(claude.needs).toBe('authorize');
		expect(claude.if).toMatch(/needs\.authorize\.outputs\.authorized == 'true'/);
	});

	test('the claude job is the only job holding write permissions or secrets', () => {
		const claude = workflow.jobs.claude;
		expect(jobGrantsWrite(claude)).toBe(true);
		expect(jobUsesSecrets(claude)).toBe(true);
		expect(isAuthorizationGated(workflow, 'claude')).toBe(true);
	});

	test('every action reference is pinned to a full commit SHA', () => {
		const references = actionReferences(workflow);
		expect(references.length).toBeGreaterThan(0);
		for (const reference of references) {
			expect(isPinnedToCommitSha(reference)).toBe(true);
		}
	});
});

describe('claude-code-review.yml: fork-reachable pull_request automation authorization', () => {
	const { workflow } = loadWorkflow('claude-code-review.yml');

	test('an `authorize` job gates the secret-bearing `review` job', () => {
		const authorize = workflow.jobs.authorize;
		const review = workflow.jobs.review;
		expect(authorize).toBeDefined();
		expect(jobGrantsWrite(authorize)).toBe(false);
		expect(jobUsesSecrets(authorize)).toBe(false);
		expect(review.needs).toBe('authorize');
		expect(isAuthorizationGated(workflow, 'review')).toBe(true);
	});

	test('the authorize job resolves the pull request author, not the workflow actor', () => {
		const authorize = workflow.jobs.authorize;
		const script = authorize.steps?.map((step) => String(step.with?.script ?? '')).join('\n') ?? '';
		expect(script).toMatch(/pull_request\.user\.login/);
		expect(script).toMatch(/getCollaboratorPermissionLevel/);
	});
});

describe('every workflow: least-privilege scaffolding', () => {
	test('every workflow declares an explicit top-level `permissions:` block', () => {
		for (const fileName of [
			'claude.yml',
			'claude-code-review.yml',
			'production.yml',
			'pull-request.yml',
		]) {
			const { workflow } = loadWorkflow(fileName);
			expect(workflow.permissions).toBeDefined();
		}
	});

	test('every job in every workflow declares explicit permissions and a timeout', () => {
		for (const fileName of [
			'claude.yml',
			'claude-code-review.yml',
			'production.yml',
			'pull-request.yml',
		]) {
			const { workflow } = loadWorkflow(fileName);
			for (const [jobName, job] of Object.entries(workflow.jobs)) {
				expect(job.permissions, `${fileName}:${jobName} permissions`).toBeDefined();
				expect(job['timeout-minutes'], `${fileName}:${jobName} timeout-minutes`).toBeDefined();
			}
		}
	});
});

/**
 * Regression test for the review-thread claim on `.github/workflows/pull-request.yml:53`
 * (PRRT_kwDORZ0PbM6baF4t): `audit:workflows`, `test:workflow-authorization`,
 * `test:workflow-prompt-injection`, `test:production-migration-gate`, and `test:scripts-security`
 * are root-level `bun run` commands (root `scripts/` and `.github/tests` are not a turbo
 * workspace, so `bun turbo test` never reaches them) that CI-SEC-001/CI-SEC-002 built but never
 * wired into any workflow. Asserted here, rather than only in the workflow YAML, so removing
 * a step from `pull-request.yml` fails a test instead of silently un-wiring the gate again.
 */
describe('pull-request.yml: root security gates are wired into CI', () => {
	const { workflow } = loadWorkflow('pull-request.yml');

	test('the check job runs every root workflow/script security gate', () => {
		const check = workflow.jobs.check;
		expect(check).toBeDefined();
		const runCommands = (check.steps ?? []).map((step) => step.run ?? '').join('\n');

		for (const command of [
			'bun run audit:workflows',
			'bun run test:workflow-authorization',
			'bun run test:workflow-prompt-injection',
			'bun run test:production-migration-gate',
			'bun run test:scripts-security',
		]) {
			expect(runCommands, `expected "${command}" to run in pull-request.yml's check job`).toContain(
				command,
			);
		}
	});
});

/**
 * Regression test for the review-thread claim on `.github/scripts/workflow-policy.ts:134`
 * (PRRT_kwDORZ0PbM6bclis): `jobUsesSecrets()` only scanned `job.secrets` and each step's
 * `with`/`env`/`run` fields, so a secret exposed only through the job-level `env:` block went
 * undetected. Such a job would be misclassified as unprivileged, letting it pass
 * `isAuthorizationGated()` checks without ever needing an authorization gate while still
 * receiving repository secrets.
 */
describe('jobUsesSecrets: job-level env detection', () => {
	test('detects a secret referenced only in the job-level `env:` block', () => {
		expect(
			jobUsesSecrets({
				env: { DATABASE_URL: '${{ secrets.DATABASE_URL }}' },
				steps: [{ run: 'echo hello' }],
			}),
		).toBe(true);
	});

	test('does not flag a job with no secrets anywhere', () => {
		expect(
			jobUsesSecrets({
				env: { NODE_ENV: 'production' },
				steps: [{ run: 'echo hello' }],
			}),
		).toBe(false);
	});
});
