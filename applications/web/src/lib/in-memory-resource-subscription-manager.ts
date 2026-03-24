import type { ResourceSubscriptionBackend } from '@template/mcp';

export class InMemoryResourceSubscriptionManager implements ResourceSubscriptionBackend {
	private uriSubscribers = new Map<string, Set<string>>();
	private updateCallbacks: Array<(uri: string) => void> = [];

	async subscribe(sessionIdentifier: string, uri: string): Promise<void> {
		let sessions = this.uriSubscribers.get(uri);
		if (!sessions) {
			sessions = new Set<string>();
			this.uriSubscribers.set(uri, sessions);
		}
		sessions.add(sessionIdentifier);
	}

	async unsubscribe(sessionIdentifier: string, uri: string): Promise<void> {
		const sessions = this.uriSubscribers.get(uri);
		if (!sessions) return;
		sessions.delete(sessionIdentifier);
		if (sessions.size === 0) {
			this.uriSubscribers.delete(uri);
		}
	}

	async unsubscribeAll(sessionIdentifier: string): Promise<void> {
		const urisToRemove: string[] = [];
		for (const [uri, sessions] of this.uriSubscribers) {
			sessions.delete(sessionIdentifier);
			if (sessions.size === 0) {
				urisToRemove.push(uri);
			}
		}
		for (const uri of urisToRemove) {
			this.uriSubscribers.delete(uri);
		}
	}

	onResourceUpdated(callback: (uri: string) => void): void {
		this.updateCallbacks.push(callback);
	}

	async publishResourceUpdate(uri: string): Promise<void> {
		for (const callback of this.updateCallbacks) {
			callback(uri);
		}
	}

	getSubscribedSessionsForUri(uri: string): Set<string> {
		return this.uriSubscribers.get(uri) ?? new Set();
	}
}
