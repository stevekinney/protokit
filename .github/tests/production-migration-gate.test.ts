import { describe, expect, test } from 'bun:test';
import { isPinnedToCommitSha, loadWorkflow } from '../scripts/workflow-policy';

describe('production.yml: migration gate', () => {
	const { workflow } = loadWorkflow('production.yml');

	test('runs are serialized with a concurrency group that never cancels an in-flight migration', () => {
		const concurrency = workflow.concurrency as { group?: string; 'cancel-in-progress'?: boolean };
		expect(concurrency).toBeDefined();
		expect(concurrency.group).toBeTruthy();
		expect(concurrency['cancel-in-progress']).toBe(false);
	});

	test('the migrate job runs behind a protected GitHub environment', () => {
		const migrate = workflow.jobs.migrate;
		expect(migrate.environment).toBe('production');
	});

	test('the migrate job checks out the exact commit that triggered the run', () => {
		const migrate = workflow.jobs.migrate;
		const checkout = migrate.steps?.find((step) => step.uses?.startsWith('actions/checkout'));
		expect(checkout).toBeDefined();
		expect(checkout?.with?.ref).toBe('${{ github.sha }}');
	});

	test('the migrate job records the pending migration plan before applying it', () => {
		const migrate = workflow.jobs.migrate;
		const scripts = migrate.steps?.map((step) => step.run ?? '').join('\n') ?? '';
		expect(scripts).toMatch(/_journal\.json/);
	});

	test('the migrate job captures rollback evidence (a pre-migration database snapshot) before migrating', () => {
		const migrate = workflow.jobs.migrate;
		const stepNames = migrate.steps?.map((step) => step.uses ?? '') ?? [];
		const snapshotIndex = stepNames.findIndex((uses) =>
			uses.startsWith('neondatabase/create-branch-action'),
		);
		const migrateIndex =
			migrate.steps?.findIndex((step) => step.run === 'bun scripts/migrate.ts') ?? -1;

		expect(snapshotIndex).toBeGreaterThanOrEqual(0);
		expect(migrateIndex).toBeGreaterThan(snapshotIndex);
	});

	test('a `deploy` job exists, depends on `migrate`, and shares the protected environment', () => {
		const deploy = workflow.jobs.deploy;
		expect(deploy).toBeDefined();
		expect(deploy.needs).toBe('migrate');
		expect(deploy.environment).toBe('production');
	});

	test('deploy checks out the revision the migrate job actually ran against, not a re-resolved `main`', () => {
		const deploy = workflow.jobs.deploy;
		const checkout = deploy.steps?.find((step) => step.uses?.startsWith('actions/checkout'));
		expect(checkout?.with?.ref).toBe('${{ needs.migrate.outputs.revision }}');
	});

	test('deploy cannot run before migrate succeeds: GitHub Actions fails a job whose `needs` job failed', () => {
		// `needs:` alone is sufficient: GitHub Actions skips a dependent job
		// when any job it needs did not succeed, unless the dependent job
		// declares its own `if: always()` (or similar) override. Assert that
		// override is absent so failure propagation is not silently defeated.
		const deploy = workflow.jobs.deploy;
		expect(deploy.if ?? '').not.toMatch(/always\(\)/);
	});

	test('every action reference in production.yml is pinned to a full commit SHA', () => {
		for (const job of Object.values(workflow.jobs)) {
			for (const step of job.steps ?? []) {
				if (step.uses) {
					expect(isPinnedToCommitSha(step.uses)).toBe(true);
				}
			}
		}
	});
});
