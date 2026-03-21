export function createTestContext(overrides?: Partial<{ userId: string }>): { userId: string } {
	return {
		userId: overrides?.userId ?? 'test-user-00000000-0000-0000-0000-000000000000',
	};
}
