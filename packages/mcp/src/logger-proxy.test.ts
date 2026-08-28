import { describe, expect, it } from 'bun:test';
import { getLogger, logger } from './logger.js';

/**
 * The lazily-built `logger` is a proxy, and its two traps have to satisfy
 * two callers that pull in opposite directions. Each test here fails if
 * the receiver handling collapses to either naive choice.
 */
describe('lazy logger proxy', () => {
	/**
	 * Regression for the review finding on this change. Pino builds a child
	 * with `Object.create(this)`, so a child of the proxy inherits from it
	 * and its own binding/state symbols are assigned through the prototype
	 * chain -- landing in the `set` trap with the CHILD as receiver.
	 *
	 * Discarding that receiver writes every child's bindings onto the shared
	 * singleton, so module-scoped children (`account-deletion`,
	 * `scheduled-cleanup`, `consent-inventory`) and the per-request
	 * `summarize` child overwrite one another. Fails loudly here: the
	 * children's bindings collide and the root logger acquires bindings it
	 * was never given.
	 */
	it('keeps the bindings of each child logger on that child', () => {
		const rootBindingsBefore = { ...logger.bindings() };

		const alpha = logger.child({ module: 'alpha' });
		const beta = logger.child({ module: 'beta', userId: 'user-beta' });

		expect(alpha.bindings().module).toBe('alpha');
		expect(beta.bindings().module).toBe('beta');
		expect(beta.bindings().userId).toBe('user-beta');

		// The second child must not have rewritten the first.
		expect(alpha.bindings().userId).toBeUndefined();

		// And neither may have leaked onto the shared singleton.
		expect(logger.bindings()).toEqual(rootBindingsBefore);
		expect(getLogger().bindings()).toEqual(rootBindingsBefore);
	});

	it('nests children without leaking the grandchild onto its parent', () => {
		const parent = logger.child({ module: 'parent' });
		const child = parent.child({ requestId: 'request-1' });

		expect(child.bindings().module).toBe('parent');
		expect(child.bindings().requestId).toBe('request-1');
		expect(parent.bindings().requestId).toBeUndefined();
	});

	/**
	 * The opposite constraint, and the reason the receiver is unwrapped
	 * rather than simply forwarded. Forwarding the proxy as receiver makes
	 * `Reflect.set` define the property on the proxy's empty target while
	 * `get` still reads from the real logger, so a patch silently does
	 * nothing -- which is how several existing tests intercept
	 * `logger.info`/`logger.child`.
	 */
	it('lets a caller monkey-patch a method and see the patch take effect', () => {
		const real = getLogger();
		const originalInfo = real.info;
		const calls: unknown[] = [];
		try {
			logger.info = ((payload: unknown) => {
				calls.push(payload);
			}) as typeof logger.info;

			expect(logger.info).toBe(real.info);
			logger.info({ probe: true });
			expect(calls).toHaveLength(1);
		} finally {
			real.info = originalInfo;
		}
	});

	it('reads through to the real instance, and memoizes it', () => {
		expect(getLogger()).toBe(getLogger());
		expect(typeof logger.info).toBe('function');
		expect(typeof logger.child).toBe('function');
	});
});
