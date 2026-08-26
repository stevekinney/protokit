import type { Component } from 'svelte';
import HomePage from '@web/components/home-page.svelte';

/**
 * Maps the `page` field of `__SERVER_DATA__` to the component that renders it.
 * Only hydrated pages appear here -- a page served without a client bundle
 * (the OAuth consent screen, the legal pages) never reaches this registry.
 */
const pages: Record<string, Component<Record<string, unknown>>> = {
	home: HomePage as unknown as Component<Record<string, unknown>>,
};

export function resolvePageComponent(page: string): Component<Record<string, unknown>> {
	const component = pages[page];
	if (!component) {
		throw new Error(`Unknown page: "${page}". Register it in src/client/page-registry.ts`);
	}
	return component;
}
