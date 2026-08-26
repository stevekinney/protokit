import type { ApplicationUser } from '@web/lib/session-authentication';

/** AUTHZ-001: one requested scope, resolved to a human-readable description, for display on the consent screen. */
export type OAuthAuthorizePageScope = {
	scope: string;
	description: string;
};

export type OAuthAuthorizePageInput =
	| {
			mode: 'error';
			error: string;
	  }
	| {
			mode: 'form';
			clientName: string;
			redirectUri: string;
			transactionId: string;
			csrfToken: string;
			user: ApplicationUser;
			/** AUTHZ-001: the exact scopes this authorization will grant if approved -- never more than what is shown here. */
			scopes: OAuthAuthorizePageScope[];
	  };
