import { describe, expect, test } from 'bun:test';
import {
	findUnsafeExpressionInterpolation,
	jobUsesSecrets,
	loadWorkflow,
} from '../scripts/workflow-policy';

/**
 * Treats every issue body, comment body, review body, PR title/body, and
 * attacker-named ref as untrusted prompt content per CI-SEC-001. These
 * checks assert the structural invariants that defeat prompt injection,
 * rather than simulating a live GitHub Actions run.
 */

const AUTOMATION_WORKFLOWS = ['claude.yml', 'claude-code-review.yml'];

describe('untrusted content cannot execute as shell syntax', () => {
	for (const fileName of AUTOMATION_WORKFLOWS) {
		test(`${fileName} never interpolates attacker-controlled text into a run: step`, () => {
			const { workflow } = loadWorkflow(fileName);
			expect(findUnsafeExpressionInterpolation(workflow)).toEqual([]);
		});
	}
});

describe('untrusted content cannot change what the AI job is allowed to do', () => {
	test('claude.yml never derives claude_args, allowed_tools, or similar action inputs from event text', () => {
		const { workflow } = loadWorkflow('claude.yml');
		const claudeStep = workflow.jobs.claude.steps?.find((step) =>
			step.uses?.startsWith('anthropics/claude-code-action'),
		);
		expect(claudeStep).toBeDefined();
		const withBlock = JSON.stringify(claudeStep?.with ?? {});
		// The only expression allowed in `with:` is the secret itself; no
		// field may reference event-supplied text.
		expect(withBlock).not.toMatch(/github\.event\.(issue|comment|pull_request|review)\./);
	});
});

describe('untrusted content cannot bypass the authorization gate or trigger recursively', () => {
	test('claude.yml excludes bot-authored senders and login suffixes before evaluating comment text', () => {
		const { workflow } = loadWorkflow('claude.yml');
		const condition = workflow.jobs.authorize.if ?? '';
		expect(condition).toMatch(/sender\.type != 'Bot'/);
		expect(condition).toMatch(/endsWith\(github\.actor, '\[bot\]'\)/);
	});

	test('claude.yml grants push/write access only inside the job gated on a live permission check', () => {
		const { workflow } = loadWorkflow('claude.yml');
		expect(jobUsesSecrets(workflow.jobs.authorize)).toBe(false);
		expect(workflow.jobs.claude.needs).toBe('authorize');
		expect(workflow.jobs.claude.permissions).toMatchObject({ contents: 'write' });
	});

	test('claude-code-review.yml cannot push branches: its review job has read-only contents permission', () => {
		const { workflow } = loadWorkflow('claude-code-review.yml');
		const review = workflow.jobs.review;
		expect(review.permissions).toMatchObject({ contents: 'read' });
		// Only pull-requests: write is granted, for posting review comments;
		// it is never combined with contents: write in this job.
		expect(review.permissions).not.toMatchObject({ contents: 'write' });
	});
});

describe('untrusted PR content never runs in a job holding secrets', () => {
	test('claude-code-review.yml gates its only secret-bearing job behind author-permission authorization', () => {
		const { workflow } = loadWorkflow('claude-code-review.yml');
		for (const [jobName, job] of Object.entries(workflow.jobs)) {
			if (jobName === 'authorize') {
				expect(jobUsesSecrets(job)).toBe(false);
				continue;
			}
			if (jobUsesSecrets(job)) {
				expect(job.needs).toBe('authorize');
			}
		}
	});
});
