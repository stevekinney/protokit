export type ResourceSubscriptionBackend = {
	subscribe(sessionIdentifier: string, uri: string): Promise<void>;
	unsubscribe(sessionIdentifier: string, uri: string): Promise<void>;
	unsubscribeAll(sessionIdentifier: string): Promise<void>;
	onResourceUpdated(callback: (uri: string) => void): void;
	publishResourceUpdate(uri: string): Promise<void>;
};
