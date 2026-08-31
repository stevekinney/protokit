import type { CrossInstanceMessaging } from '../oauth/index.js';

const grantRevocationChannel = 'mcp:control:grant-revocations';

function readUserId(message: string): string | undefined {
	try {
		const parsed: unknown = JSON.parse(message);
		if (typeof parsed !== 'object' || parsed === null) return undefined;
		const userId = (parsed as { userId?: unknown }).userId;
		return typeof userId === 'string' && userId.length > 0 ? userId : undefined;
	} catch {
		return undefined;
	}
}

/** Coordinates live-stream closure after a committed grant revocation. */
export class GrantRevocationChannel {
	private unsubscribe: (() => Promise<void>) | undefined;

	constructor(
		private readonly closeLocalUser: (userId: string) => void | Promise<unknown>,
		private readonly messaging?: CrossInstanceMessaging,
		private readonly onError: (error: unknown, userId?: string) => void = () => {},
	) {}

	async start(): Promise<void> {
		if (!this.messaging || this.unsubscribe) return;
		try {
			this.unsubscribe = await this.messaging.subscribe(grantRevocationChannel, (message) => {
				const userId = readUserId(message);
				if (userId) this.runLocalCloser(userId);
			});
		} catch (error) {
			this.onError(error);
		}
	}

	async publish(userId: string): Promise<void> {
		if (!this.messaging) {
			this.runLocalCloser(userId);
			return;
		}
		try {
			await this.messaging.publish(grantRevocationChannel, JSON.stringify({ userId }));
		} catch (error) {
			this.onError(error, userId);
			this.runLocalCloser(userId);
		}
	}

	async close(): Promise<void> {
		const unsubscribe = this.unsubscribe;
		this.unsubscribe = undefined;
		if (!unsubscribe) return;
		try {
			await unsubscribe();
		} catch (error) {
			this.onError(error);
		}
	}

	private runLocalCloser(userId: string): void {
		void Promise.resolve(this.closeLocalUser(userId)).catch((error: unknown) => {
			this.onError(error, userId);
		});
	}
}
