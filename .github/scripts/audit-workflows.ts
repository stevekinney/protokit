#!/usr/bin/env bun
/**
 * Fails (non-zero exit) if any workflow under `.github/workflows/` violates
 * the CI-SEC-001 hardening policy: missing top-level or job permissions, an
 * action not pinned to a full commit SHA, no job timeout or concurrency
 * group, or a job holding write permissions/secrets on an untrusted-content
 * trigger without a read-only, secret-free authorization gate ahead of it.
 */

import {
	auditWorkflows,
	findUnsafeExpressionInterpolation,
	formatViolations,
	loadAllWorkflows,
} from './workflow-policy';

const violations = auditWorkflows();
for (const { fileName, workflow } of loadAllWorkflows()) {
	for (const violation of findUnsafeExpressionInterpolation(workflow)) {
		violations.push({ ...violation, fileName: `${fileName} (${violation.fileName})` });
	}
}

if (violations.length === 0) {
	console.log('audit:workflows: no violations found.');
	process.exit(0);
}

console.error(`audit:workflows: ${violations.length} violation(s) found:\n`);
console.error(formatViolations(violations));
process.exit(1);
