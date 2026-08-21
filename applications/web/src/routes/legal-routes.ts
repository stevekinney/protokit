import { environment } from '@web/env';
import { createStaticHtmlResponse } from '@web/lib/html-response';
import { PrivacyPolicyPage, SupportPage, TermsOfServicePage } from '@web/views/legal-pages';

/**
 * DOCS-001: `/privacy`, `/terms`, and `/support` — real, checked-in content
 * (see `legal-pages.tsx`), served static (no client bundle, matching the
 * OAuth consent page's pattern) and dispatched without a session, the same
 * way the `/.well-known/*` metadata documents are — none of these pages
 * needs `context.user`, and there is no reason to query session storage on
 * an unauthenticated request for them.
 */

export function handlePrivacyPolicyGet(): Response {
	return createStaticHtmlResponse({
		metadata: { title: 'Privacy Policy' },
		body: PrivacyPolicyPage({ supportContactEmail: environment.SUPPORT_CONTACT_EMAIL }),
	});
}

export function handleTermsOfServiceGet(): Response {
	return createStaticHtmlResponse({
		metadata: { title: 'Terms of Service' },
		body: TermsOfServicePage({ supportContactEmail: environment.SUPPORT_CONTACT_EMAIL }),
	});
}

export function handleSupportGet(): Response {
	return createStaticHtmlResponse({
		metadata: { title: 'Support' },
		body: SupportPage({ supportContactEmail: environment.SUPPORT_CONTACT_EMAIL }),
	});
}
