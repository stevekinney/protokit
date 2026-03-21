import { metricsCollector } from '@template/mcp/metrics';
import { jsonResponse } from '@web/lib/http-response';

export async function handleMetricsGet(): Promise<Response> {
	return jsonResponse(metricsCollector.snapshot());
}
