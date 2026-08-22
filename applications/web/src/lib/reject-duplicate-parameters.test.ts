import { describe, expect, it } from 'bun:test';
import { findDuplicateParameterName } from '@web/lib/reject-duplicate-parameters';

describe('findDuplicateParameterName', () => {
	it('returns null when every named parameter appears at most once', () => {
		const params = new URLSearchParams('client_id=c1&redirect_uri=https://example.com');
		expect(findDuplicateParameterName(params, ['client_id', 'redirect_uri', 'state'])).toBeNull();
	});

	it('detects a duplicate query parameter', () => {
		const params = new URLSearchParams('client_id=c1&client_id=c2');
		expect(findDuplicateParameterName(params, ['client_id'])).toBe('client_id');
	});

	it('detects a duplicate form-urlencoded parameter', () => {
		const params = new URLSearchParams('grant_type=authorization_code&code=a&code=b');
		expect(findDuplicateParameterName(params, ['grant_type', 'code'])).toBe('code');
	});

	it('ignores duplicates of parameters not in the checked set', () => {
		const params = new URLSearchParams('untracked=1&untracked=2&client_id=c1');
		expect(findDuplicateParameterName(params, ['client_id'])).toBeNull();
	});

	it('ignores parameters that are entirely absent', () => {
		const params = new URLSearchParams('');
		expect(findDuplicateParameterName(params, ['client_id', 'state'])).toBeNull();
	});
});
