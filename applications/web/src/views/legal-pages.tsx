import type { JSX } from 'react';

/**
 * DOCS-001: real, checked-in privacy/terms/support content, served as
 * ordinary server-rendered pages (no client bundle — same reasoning as the
 * OAuth consent page: nothing here needs client-side JavaScript to
 * function) and linked from both authorization server metadata (RFC 8414
 * `service_documentation`/`op_policy_uri`/`op_tos_uri`) and protected
 * resource metadata (RFC 9728 `resource_documentation`/`resource_policy_uri`/
 * `resource_tos_uri`) so a connecting client or a reviewing host can
 * discover them without an out-of-band link — see
 * `applications/web/src/routes/oauth-routes.tsx`.
 *
 * This content describes what this codebase actually does, not aspirational
 * policy. Update it if the code it describes changes — a page that
 * contradicts the code is worse than no page at all, the same standard this
 * repository holds every other document to.
 */

type SupportContactInput = {
	supportContactEmail: string | undefined;
};

function SupportContactNotice(props: SupportContactInput): JSX.Element {
	if (props.supportContactEmail) {
		return (
			<p className="mt-2 text-slate-600">
				Contact{' '}
				<a
					className="font-semibold text-indigo-700 underline"
					href={`mailto:${props.supportContactEmail}`}
				>
					{props.supportContactEmail}
				</a>
				.
			</p>
		);
	}

	return (
		<p className="mt-2 text-amber-700">
			This deployment has not configured a support contact. The operator running this server should
			set <code className="rounded bg-slate-100 px-1 py-0.5 text-sm">SUPPORT_CONTACT_EMAIL</code> in
			its environment.
		</p>
	);
}

function LegalPageShell(props: { title: string; children: JSX.Element }): JSX.Element {
	return (
		<main className="mx-auto mt-12 mb-16 w-full max-w-3xl px-6">
			<a className="text-sm font-semibold text-indigo-700 underline" href="/">
				&larr; Back to home
			</a>
			<div className="mt-6 rounded-3xl border border-slate-200 bg-white p-10 shadow-lg shadow-slate-200/40">
				<h1 className="text-3xl font-black text-slate-900">{props.title}</h1>
				<div className="prose prose-slate mt-6 max-w-none">{props.children}</div>
			</div>
		</main>
	);
}

export function PrivacyPolicyPage(props: SupportContactInput): JSX.Element {
	return (
		<LegalPageShell title="Privacy Policy">
			<>
				<p>
					This server is a Model Context Protocol (MCP) connector. It authenticates human users with
					Google sign-in and authenticates MCP clients (Claude, Codex, ChatGPT, and similar hosts)
					with OAuth 2.1 access tokens scoped to specific capabilities.
				</p>

				<h2>Data this server collects</h2>
				<ul>
					<li>
						<strong>Account identity</strong>: the email address, display name, and avatar URL
						Google's sign-in flow returns, stored so the same person is recognized across sessions.
					</li>
					<li>
						<strong>Session and OAuth credentials</strong>: every session cookie, authorization
						code, access token, refresh token, and OAuth client secret is stored only as a SHA-256
						hash — the plaintext value is never written to the database, and cannot be recovered
						from a database read alone.
					</li>
					<li>
						<strong>Request metadata for abuse prevention</strong>: a coarse network identity (the
						request's IP address, or a value from a configured trusted proxy header) is used
						transiently to enforce rate limits and lockouts; it is not stored beyond the sliding
						window each control uses (typically under a few minutes).
					</li>
					<li>
						<strong>Operational logs</strong>: structured logs record what happened (an event name
						and outcome, a request identifier, a user identifier) — never a token, password, secret,
						or the raw content of a prompt or tool call. See this repository's own{' '}
						<code>RUNBOOK.md</code> for the exact redaction policy.
					</li>
				</ul>
				<p>
					This server does not sell data, does not use it for advertising, and does not share it
					with any party beyond the subprocessors named below and whatever MCP tool call a connected
					client explicitly authorizes.
				</p>

				<h2>Retention and deletion</h2>
				<p>
					Sessions, authorization codes, and access/refresh tokens expire on a fixed schedule and
					are periodically purged once expired or revoked. A user can revoke any connected OAuth
					client's access from their account page at any time, which immediately invalidates that
					client's outstanding tokens. Deleting an account removes the account row and every
					session, OAuth grant, and consent record tied to it — no orphaned credential or service
					identity is left usable afterward.
				</p>

				<h2>Subprocessors</h2>
				<p>This deployment depends on the following third-party services to operate:</p>
				<ul>
					<li>
						<strong>Neon</strong> (Postgres database) — stores account records, hashed credentials,
						and OAuth grant metadata.
					</li>
					<li>
						<strong>A Redis-compatible provider</strong> configured by the operator — stores
						short-lived rate-limit counters and single-use authentication state; holds no durable
						data and no plaintext credential.
					</li>
					<li>
						<strong>Railway</strong> (or whichever hosting platform the operator deploys this
						template to) — runs the application process and terminates inbound TLS.
					</li>
					<li>
						<strong>Google</strong> — provides identity verification for sign-in. This server never
						receives a user's Google password, only Google's signed assertion of who the user is.
					</li>
				</ul>

				<h2>Consent</h2>
				<p>
					When an MCP client requests access, this server's consent screen names the client and the
					specific scopes it is requesting in plain language before any authorization is granted.
					Approving a request grants exactly the scopes shown — never more — and can be revoked at
					any time from the account page.
				</p>

				<h2>Contact</h2>
				<SupportContactNotice supportContactEmail={props.supportContactEmail} />
			</>
		</LegalPageShell>
	);
}

export function TermsOfServicePage(props: SupportContactInput): JSX.Element {
	return (
		<LegalPageShell title="Terms of Service">
			<>
				<p>
					These terms govern use of this MCP server and its OAuth authorization endpoints. By
					signing in or authorizing an MCP client against this server, you agree to the terms below.
				</p>

				<h2>What this service provides</h2>
				<p>
					An MCP server exposing a small set of tools, resources, and prompts to authenticated MCP
					clients over OAuth 2.1, plus the browser-based sign-in and consent flow that grants that
					access. The exact capabilities offered are described in this server's MCP server
					instructions and tool metadata, discoverable by any connected client.
				</p>

				<h2>Acceptable use</h2>
				<ul>
					<li>
						Do not attempt to bypass, probe, or defeat this server's authentication, rate limiting,
						or scope enforcement.
					</li>
					<li>Do not use a registered OAuth client identity to impersonate another party.</li>
					<li>
						Do not use this service to store, request, or generate content that violates applicable
						law.
					</li>
				</ul>

				<h2>Availability and changes</h2>
				<p>
					This service is provided on an as-available basis with no uptime guarantee beyond whatever
					the operator's own deployment commits to separately. Tool behavior, scopes, and supported
					protocol revisions may change between deployments; a connected client should re-read this
					server's discovery metadata rather than assume a prior capability set remains fixed.
				</p>

				<h2>Termination</h2>
				<p>
					Either party may end this relationship at any time: a user may revoke a connected client's
					access or delete their account from the account page, and the operator may revoke or
					remove any OAuth client's registration, which immediately invalidates its outstanding
					tokens.
				</p>

				<h2>Contact</h2>
				<SupportContactNotice supportContactEmail={props.supportContactEmail} />
			</>
		</LegalPageShell>
	);
}

export function SupportPage(props: SupportContactInput): JSX.Element {
	return (
		<LegalPageShell title="Support">
			<>
				<p>
					For a connector-specific problem — an OAuth authorization failure, a tool returning an
					unexpected error, or a question about what a scope grants — the fastest path is usually
					the connecting client's own error message: this server's OAuth error responses and MCP
					tool errors are written to be readable on their own, and never reference a case number or
					internal ticketing system this page would otherwise need to explain.
				</p>

				<h2>Removing a connector</h2>
				<p>
					Sign in to this server's home page and use the account page's connection management to
					revoke a specific client's access, or revoke every connected client at once. This
					immediately invalidates that client's outstanding access and refresh tokens.
				</p>

				<h2>Reporting a security issue</h2>
				<p>
					If you believe you have found a security vulnerability in this server, do not open a
					public issue — contact the address below directly with what you found and how to reproduce
					it.
				</p>

				<h2>Everything else</h2>
				<SupportContactNotice supportContactEmail={props.supportContactEmail} />
			</>
		</LegalPageShell>
	);
}
