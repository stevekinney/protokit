import { describe, expect, it } from 'bun:test';
import {
	describeBindAddress,
	LOOPBACK_ADDRESS,
	resolveBindAddress,
} from '@web/lib/resolve-bind-address';

describe('resolveBindAddress', () => {
	describe('with no explicit configuration', () => {
		it('binds to loopback in development so the server is not reachable from the LAN', () => {
			expect(
				resolveBindAddress({
					nodeEnvironment: 'development',
					configuredBindAddress: undefined,
				}),
			).toBe(LOOPBACK_ADDRESS);
		});

		it('binds to loopback in test for the same reason', () => {
			expect(
				resolveBindAddress({ nodeEnvironment: 'test', configuredBindAddress: undefined }),
			).toBe(LOOPBACK_ADDRESS);
		});

		it('listens on every interface in production', () => {
			expect(
				resolveBindAddress({
					nodeEnvironment: 'production',
					configuredBindAddress: undefined,
				}),
			).toBeUndefined();
		});
	});

	describe('with an explicit configuration', () => {
		it('honors an explicit bind address in a non-production environment, which is what makes a container reachable', () => {
			expect(
				resolveBindAddress({ nodeEnvironment: 'test', configuredBindAddress: '0.0.0.0' }),
			).toBeUndefined();
		});

		it('honors an explicit loopback bind address in production', () => {
			expect(
				resolveBindAddress({
					nodeEnvironment: 'production',
					configuredBindAddress: LOOPBACK_ADDRESS,
				}),
			).toBe(LOOPBACK_ADDRESS);
		});

		it('honors a specific interface address verbatim', () => {
			expect(
				resolveBindAddress({
					nodeEnvironment: 'production',
					configuredBindAddress: '10.0.1.5',
				}),
			).toBe('10.0.1.5');
		});

		it('does not treat an unset value as an instruction to widen the binding', () => {
			expect(
				resolveBindAddress({
					nodeEnvironment: 'development',
					configuredBindAddress: undefined,
				}),
			).toBe(LOOPBACK_ADDRESS);
		});
	});
});

describe('describeBindAddress', () => {
	it('reports every-interface binding as 0.0.0.0 rather than undefined', () => {
		expect(describeBindAddress(undefined)).toBe('0.0.0.0');
	});

	it('reports a specific address unchanged', () => {
		expect(describeBindAddress(LOOPBACK_ADDRESS)).toBe(LOOPBACK_ADDRESS);
	});
});
