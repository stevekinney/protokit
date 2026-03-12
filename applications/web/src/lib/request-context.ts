import type { ApplicationUser } from '@web/lib/session-authentication';

export type RequestContext = {
	request: Request;
	requestUrl: URL;
	clientAddress?: string;
	user: ApplicationUser | null;
	sessionToken: string | null;
};
