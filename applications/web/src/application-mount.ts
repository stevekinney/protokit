import { handleApplicationRequest } from '@web/application';

/**
 * The seam a host application (a SvelteKit hook, a Bun server
 * that owns its own static file serving, etc.) uses to mount this
 * application's dynamic routes -- OAuth, MCP, health, everything
 * `application.ts` dispatches -- without also inheriting its static-asset
 * serving. A host that embeds this application already has its own answer
 * for `/assets/*` and `/favicon.png` (its own bundler output, its own CDN);
 * letting both this application and the host try to serve the same paths
 * is exactly the double-serving this seam exists to avoid.
 *
 * The factory itself takes no parameters -- there is nothing to configure
 * at mount time, `serveStaticAssets` is unconditionally `false` for this
 * variant. `clientAddress` instead lives on the returned handler's
 * per-call `input`, matching `handleApplicationRequest`'s own shape,
 * because the client address is per-request state a host only knows once
 * a request actually arrives (`Bun.serve`'s `server.requestIP(request)`, or
 * a SvelteKit host's `event.getClientAddress()`) -- it is never known at
 * the point where the mount handler itself is constructed.
 */
export function createApplicationMountHandler(): (
	request: Request,
	input: { clientAddress?: string },
) => Promise<Response> {
	return (request, input) =>
		handleApplicationRequest(request, {
			clientAddress: input.clientAddress,
			serveStaticAssets: false,
		});
}
