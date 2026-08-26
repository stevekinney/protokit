import { hydrate } from 'svelte';
import { resolvePageComponent } from '@web/client/page-registry';

/**
 * `hydrate` rather than `mount`: the markup is already in the document from
 * the server render, and this attaches behavior to it in place. `mount` would
 * discard and re-create that DOM, losing the server-rendered content.
 *
 * The props passed here are the same `__SERVER_DATA__` object the server used
 * as its render props, which is what keeps the two renders in agreement.
 */
const serverDataElement = document.getElementById('__SERVER_DATA__');

if (serverDataElement) {
	const serverData = JSON.parse(serverDataElement.textContent ?? '{}') as Record<string, unknown>;
	const rootElement = document.getElementById('application-root');

	if (rootElement && typeof serverData['page'] === 'string') {
		hydrate(resolvePageComponent(serverData['page']), {
			target: rootElement,
			props: serverData,
		});
	}
}
