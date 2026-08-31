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
	private startup: Promise<void> | undefined;
	private closeRequested = false;

	constructor(
		private readonly closeLocalUser: (userId: string) => void | Promise<unknown>,
		private readonly messaging?: CrossInstanceMessaging,
		private readonly onError: (error: unknown, userId?: string) => void = () => {},
	) {}

	async start(): Promise<void> {
		if (!this.messaging || this.unsubscribe || this.closeRequested) return;
		if (!this.startup) {
			const startup = this.subscribe();
			this.startup = startup;
			void startup.finally(() => {
				if (this.startup === startup) this.startup = undefined;
			});
		}
		await this.startup;
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
		}
		this.runLocalCloser(userId);
	}

	async close(): Promise<void> {
		this.closeRequested = true;
		await this.startup;
		const unsubscribe = this.unsubscribe;
		if (!unsubscribe) return;
		try {
			await unsubscribe();
			if (this.unsubscribe === unsubscribe) this.unsubscribe = undefined;
		} catch (error) {
			this.onError(error);
		}
	}

	private async subscribe(): Promise<void> {
		try {
			this.unsubscribe = await this.messaging?.subscribe(grantRevocationChannel, (message) => {
				const userId = readUserId(message);
				if (userId) this.runLocalCloser(userId);
			});
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
