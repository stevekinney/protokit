const minimumVerifierLength = 43;
const maximumVerifierLength = 128;
const challengeLength = 43;
const verifierPattern = new RegExp(
	`^[A-Za-z0-9\\-._~]{${minimumVerifierLength},${maximumVerifierLength}}$`,
);
const challengePattern = new RegExp(`^[A-Za-z0-9_-]{${challengeLength}}$`);

export function isValidPkceCodeVerifier(value: string): boolean {
	return verifierPattern.test(value);
}

export function isValidPkceCodeChallenge(value: string): boolean {
	return challengePattern.test(value);
}
