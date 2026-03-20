export function createToolTextResponse(text: string) {
	return {
		content: [{ type: 'text' as const, text }],
	};
}

export function createToolJsonResponse(data: unknown) {
	return {
		content: [{ type: 'text' as const, text: JSON.stringify(data) }],
	};
}

export function createToolErrorResponse(message: string) {
	return {
		content: [{ type: 'text' as const, text: message }],
		isError: true,
	};
}
