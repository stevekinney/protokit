export type SvelteKitMountState = 'available' | 'constructing' | 'live' | 'disposed';

let mountState: SvelteKitMountState = 'available';

export function getSvelteKitMountState(): SvelteKitMountState {
	return mountState;
}

export function setSvelteKitMountState(state: SvelteKitMountState): void {
	mountState = state;
}

export function resetSvelteKitMountStateForTesting(): void {
	mountState = 'available';
}
