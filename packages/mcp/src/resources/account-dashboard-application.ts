import { logger } from '../logger.js';

const dashboardHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Account Dashboard</title>
    <style>
      :root {
        color-scheme: light dark;
        --background: #f7f4ef;
        --foreground: #19140f;
        --card: #ffffff;
        --accent: #0f766e;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --background: #101214;
          --foreground: #f5efe7;
          --card: #171a1d;
          --accent: #2dd4bf;
        }
      }
      body {
        margin: 0;
        font-family: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
        background: radial-gradient(circle at top right, color-mix(in srgb, var(--accent) 16%, transparent), transparent 50%), var(--background);
        color: var(--foreground);
      }
      main {
        max-width: 720px;
        margin: 2rem auto;
        padding: 1rem;
      }
      .card {
        background: var(--card);
        border-radius: 14px;
        box-shadow: 0 10px 28px color-mix(in srgb, black 14%, transparent);
        padding: 1.2rem;
      }
      h1 {
        margin: 0 0 0.75rem 0;
      }
      p {
        margin: 0.5rem 0;
        line-height: 1.5;
      }
      .muted {
        opacity: 0.75;
        font-size: 0.95rem;
      }
      code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="card">
        <h1>Account Dashboard</h1>
        <p>This MCP app resource can render interactive account context in hosts that support <code>io.modelcontextprotocol/ui</code>.</p>
        <p class="muted">The host can inject state from the corresponding tool call result metadata.</p>
      </section>
    </main>
  </body>
</html>`;

export const accountDashboardApplicationResource = {
	name: 'account_dashboard_application' as const,
	uri: 'ui://account-dashboard',
	description: 'UI resource for account dashboard rendering in MCP App-compatible hosts.',
	mimeType: 'text/html;profile=mcp-app',
	handler: async (uri: URL, context: { userId: string }) => {
		const requestLogger = logger.child({
			resource: 'account_dashboard_application',
			userId: context.userId,
		});
		requestLogger.info({ uri: uri.href }, 'Resource read completed');

		return {
			contents: [
				{
					uri: uri.href,
					mimeType: 'text/html;profile=mcp-app',
					text: dashboardHtml,
					_meta: {
						'io.modelcontextprotocol/ui': {
							csp: {
								'default-src': ["'none'"],
								'style-src': ["'unsafe-inline'"],
							},
							permissions: [],
						},
					},
				},
			],
		};
	},
};
