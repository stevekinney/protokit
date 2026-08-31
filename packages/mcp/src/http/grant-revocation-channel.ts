import type { CrossInstanceMessaging } from '../oauth/index.js';

const grantRevocationChannel = 'mcp:control:grant-revocations';
const initialRetryDelayMilliseconds = 1_000;
const maximumRetryDelayMilliseconds = 30_000;

export type GrantRevocationRetryConfiguration = {
	initialDelayMilliseconds: number;
	maximumDelayMilliseconds: number;
};

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
	private finishRetryDelay: (() => void) | undefined;
	private retryDelayMilliseconds: number;

	constructor(
		private readonly closeLocalUser: (userId: string) => void | Promise<unknown>,
		private readonly messaging?: CrossInstanceMessaging,
		private readonly onError: (error: unknown, userId?: string) => void = () => {},
		private readonly retryConfiguration: GrantRevocationRetryConfiguration = {
			initialDelayMilliseconds: initialRetryDelayMilliseconds,
			maximumDelayMilliseconds: maximumRetryDelayMilliseconds,
		},
	) {
		this.retryDelayMilliseconds = retryConfiguration.initialDelayMilliseconds;
	}

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
		this.finishRetryDelay?.();
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
		while (!this.closeRequested && !this.unsubscribe) {
			try {
				this.unsubscribe = await this.messaging?.subscribe(grantRevocationChannel, (message) => {
					const userId = readUserId(message);
					if (userId) this.runLocalCloser(userId);
				});
				this.retryDelayMilliseconds = this.retryConfiguration.initialDelayMilliseconds;
			} catch (error) {
				this.onError(error);
				if (!this.closeRequested) await this.waitBeforeRetry();
			}
		}
	}

	private async waitBeforeRetry(): Promise<void> {
		const delayMilliseconds = this.retryDelayMilliseconds;
		this.retryDelayMilliseconds = Math.min(
			delayMilliseconds * 2,
			this.retryConfiguration.maximumDelayMilliseconds,
		);
		await new Promise<void>((resolve) => {
			const finish = () => {
				clearTimeout(timer);
				if (this.finishRetryDelay === finish) this.finishRetryDelay = undefined;
				resolve();
			};
			this.finishRetryDelay = finish;
			const timer = setTimeout(finish, delayMilliseconds);
			timer.unref?.();
		});
	}

	private runLocalCloser(userId: string): void {
		void Promise.resolve(this.closeLocalUser(userId)).catch((error: unknown) => {
			this.onError(error, userId);
		});
	}
}
