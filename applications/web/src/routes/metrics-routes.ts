import { metricsCollector } from '@template/mcp/metrics';
import { jsonResponse } from '@web/lib/http-response';
import { environment } from '@web/env';

export async function handleMetricsGet(request: Request): Promise<Response> {
	const apiKey = environment.METRICS_API_KEY;

	if (!apiKey) {
		return jsonResponse({ error: 'not_found' }, { status: 404 });
	}

	const authorization = request.headers.get('authorization');
	if (authorization !== `Bearer ${apiKey}`) {
		return jsonResponse({ error: 'unauthorized' }, { status: 401 });
	}

	return jsonResponse(metricsCollector.snapshot());
}
