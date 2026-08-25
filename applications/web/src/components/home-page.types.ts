/**
 * Props for the home page.
 *
 * These are exactly the fields `renderHomePage` puts into `serverData`, and
 * that is deliberate: `serverData` is the single source of props for both the
 * server `render()` call and the client `hydrate()` call, so the two sides
 * cannot drift into a hydration mismatch. Anything added here must be added
 * to `serverData`, and must be JSON-serializable.
 */
export type ConnectionSummaryView = {
	clientId: string;
	clientName: string;
	earliestExpiresAt: string;
};

/** The subset of the account record that is safe to send to the browser. */
export type HomePageUser = {
	email: string;
	name: string | null;
	image: string | null;
};

export type HomePageProps = {
	user: HomePageUser | null;
	baseUrl: string;
	/**
	 * SEC-005: a session-bound, one-time-per-session CSRF value for the
	 * sign-out form (`csrf-protection.ts`'s `deriveSessionCsrfToken`). Only
	 * present when `user` is, since there is no session to protect otherwise.
	 */
	signOutCsrfToken?: string;
	/**
	 * DATA-001 / S-18: the connector/consent inventory -- every OAuth client
	 * currently holding at least one live access or refresh token for this
	 * user. Empty when signed out or when nothing is connected.
	 */
	connections?: ConnectionSummaryView[];
	/** Same session-bound CSRF token as `signOutCsrfToken`, reused for the revoke forms. */
	connectionsCsrfToken?: string;
};
