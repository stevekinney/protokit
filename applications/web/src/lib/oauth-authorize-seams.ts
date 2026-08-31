import type { ConsentPresentation, OAuthHostSeams } from '@lostgradient/mcp/oauth';
import { fetchClientIdMetadataDocument } from '@lostgradient/mcp/oauth/client-metadata-documents';
import { createStaticHtmlResponse } from '@web/lib/html-response';
import { redirectResponse } from '@web/lib/http-response';
import {
	createOauthStatelessHostSeams,
	toOauthRequestContext,
} from '@web/lib/oauth-stateless-seams';
import { oauthStores } from '@web/lib/oauth-stateless-stores';
import type { RequestContext } from '@web/lib/request-context';
import OauthAuthorizePage from '@web/views/oauth-authorize-page.svelte';

function signInRedirectPath(requestUrl: URL): string {
	const callbackPath = `${requestUrl.pathname}${requestUrl.search}`;
	return `/auth/google/start?callback_path=${encodeURIComponent(callbackPath)}`;
}

export function createOauthAuthorizeHostSeams(context: RequestContext): OAuthHostSeams<string> {
	const stateless = createOauthStatelessHostSeams(context.request);
	return {
		...stateless,
		stores: oauthStores,
		fetchClientIdMetadataDocument,
		resolveIdentityBinding: async () => toOauthRequestContext(context).identity,
		resolveUserProfile: async (subjectId) => (context.user?.id === subjectId ? context.user : null),
		handleUnauthenticatedAuthorization: () =>
			redirectResponse(signInRedirectPath(context.requestUrl)),
		renderConsent: (presentation: ConsentPresentation) => {
			if (presentation.mode === 'error') {
				return createStaticHtmlResponse({
					metadata: { title: 'OAuth Authorize' },
					status: 400,
					component: OauthAuthorizePage,
					props: presentation,
				});
			}
			if (!context.user) throw new Error('Consent rendering requires a resolved user');
			return createStaticHtmlResponse({
				metadata: { title: 'OAuth Authorize' },
				component: OauthAuthorizePage,
				props: {
					mode: 'form',
					clientName: presentation.client.name,
					redirectUri: presentation.redirectUri,
					transactionId: presentation.transactionId,
					csrfToken: presentation.csrfToken,
					user: context.user,
					scopes: presentation.scopes,
				},
			});
		},
	};
}
