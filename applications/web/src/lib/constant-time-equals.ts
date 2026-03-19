import { timingSafeEqual } from 'node:crypto';

export function constantTimeEquals(leftValue: string, rightValue: string): boolean {
	const leftBuffer = Buffer.from(leftValue, 'utf-8');
	const rightBuffer = Buffer.from(rightValue, 'utf-8');
	if (leftBuffer.length !== rightBuffer.length) {
		return false;
	}

	return timingSafeEqual(leftBuffer, rightBuffer);
}
