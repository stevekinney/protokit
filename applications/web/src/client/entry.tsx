import { createElement } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { resolvePageComponent } from '@web/client/page-registry';

const serverDataElement = document.getElementById('__SERVER_DATA__');
if (serverDataElement) {
	const serverData = JSON.parse(serverDataElement.textContent ?? '{}');
	const rootElement = document.getElementById('application-root');

	if (rootElement && serverData.page) {
		const PageComponent = resolvePageComponent(serverData.page);
		hydrateRoot(rootElement, createElement(PageComponent, serverData));
	}
}
