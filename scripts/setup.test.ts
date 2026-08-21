import { describe, test, expect } from 'bun:test';
import { isValidNeonRegionIdentifier } from './setup.ts';

describe('isValidNeonRegionIdentifier', () => {
	test('accepts real Neon region identifiers', () => {
		expect(isValidNeonRegionIdentifier('aws-us-east-2')).toBe(true);
		expect(isValidNeonRegionIdentifier('azure-eastus2')).toBe(true);
		expect(isValidNeonRegionIdentifier('aws-eu-central-1')).toBe(true);
	});

	test('rejects values that could inject additional CLI arguments or shell metacharacters', () => {
		expect(isValidNeonRegionIdentifier('aws-us-east-2 --org-id evil')).toBe(false);
		expect(isValidNeonRegionIdentifier('aws-us-east-2; rm -rf /')).toBe(false);
		expect(isValidNeonRegionIdentifier('$(whoami)')).toBe(false);
		expect(isValidNeonRegionIdentifier('aws-us-east-2\n--flag')).toBe(false);
		expect(isValidNeonRegionIdentifier('')).toBe(false);
		expect(isValidNeonRegionIdentifier('-leading-hyphen')).toBe(false);
	});
});
