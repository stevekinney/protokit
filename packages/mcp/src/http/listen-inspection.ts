/**
 * Detects the `subscriptions/listen` request whose response the transport must
 * not force-close on graceful shutdown. Shared by the serving handler (for
 * subscription-scope authorization) and the serving layer (to tag the final
 * response), so neither needs a runtime dependency on the other (TRI-128).
 */
export type ListenInspection = { isListenRequest: boolean; requestedResourceUris: string[] };

function readRequestedResourceUris(message: object): string[] {
	const parameters = (message as { params?: unknown }).params;
	if (typeof parameters !== 'object' || parameters === null) return [];
	const notifications = (parameters as { notifications?: unknown }).notifications;
	if (typeof notifications !== 'object' || notifications === null) return [];
	const uris = (notifications as { resourceSubscriptions?: unknown }).resourceSubscriptions;
	return Array.isArray(uris) ? uris.filter((uri): uri is string => typeof uri === 'string') : [];
}

export async function inspectListenRequest(request: Request): Promise<ListenInspection> {
	const none = { isListenRequest: false, requestedResourceUris: [] };
	if (!request.body) return none;
	try {
		const parsed: unknown = await request.clone().json();
		const messages = Array.isArray(parsed) ? parsed : [parsed];
		const listens = messages.filter(
			(message): message is object =>
				typeof message === 'object' &&
				message !== null &&
				(message as { method?: unknown }).method === 'subscriptions/listen',
		);
		return listens.length === 0
			? none
			: {
					isListenRequest: true,
					requestedResourceUris: listens.flatMap(readRequestedResourceUris),
				};
	} catch {
		return none;
	}
}
