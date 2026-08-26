import { environment } from '@web/env';
import { createStaticHtmlResponse } from '@web/lib/html-response';
import PrivacyPolicyPage from '@web/views/privacy-policy-page.svelte';
import SupportPage from '@web/views/support-page.svelte';
import TermsOfServicePage from '@web/views/terms-of-service-page.svelte';

/**
 * DOCS-001: `/privacy`, `/terms`, and `/support` — real, checked-in content
 * (see `privacy-policy-page.svelte` and its siblings), served static (no client bundle, matching the
 * OAuth consent page's pattern) and dispatched without a session, the same
 * way the `/.well-known/*` metadata documents are — none of these pages
 * needs `context.user`, and there is no reason to query session storage on
 * an unauthenticated request for them.
 */

export function handlePrivacyPolicyGet(): Response {
	return createStaticHtmlResponse({
		metadata: { title: 'Privacy Policy' },
		component: PrivacyPolicyPage,
		props: { supportContactEmail: environment.supportContactEmail },
	});
}

export function handleTermsOfServiceGet(): Response {
	return createStaticHtmlResponse({
		metadata: { title: 'Terms of Service' },
		component: TermsOfServicePage,
		props: { supportContactEmail: environment.supportContactEmail },
	});
}

export function handleSupportGet(): Response {
	return createStaticHtmlResponse({
		metadata: { title: 'Support' },
		component: SupportPage,
		props: { supportContactEmail: environment.supportContactEmail },
	});
}
