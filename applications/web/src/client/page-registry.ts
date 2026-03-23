import type { ComponentType } from 'react';
import { HomePage } from '@web/components/home-page';

const pages: Record<string, ComponentType<Record<string, unknown>>> = {
	home: HomePage as ComponentType<Record<string, unknown>>,
};

export function resolvePageComponent(page: string): ComponentType<Record<string, unknown>> {
	const component = pages[page];
	if (!component) {
		throw new Error(`Unknown page: "${page}". Register it in src/client/page-registry.ts`);
	}
	return component;
}
