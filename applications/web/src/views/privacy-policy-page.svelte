<!--
	DOCS-001: real, checked-in privacy/terms/support content, served as ordinary
	server-rendered pages (no client bundle -- same reasoning as the OAuth
	consent page: nothing here needs client-side JavaScript to function) and
	linked from both authorization server metadata (RFC 8414
	`service_documentation`/`op_policy_uri`/`op_tos_uri`) and protected resource
	metadata (RFC 9728 `resource_documentation`/`resource_policy_uri`/
	`resource_tos_uri`) so a connecting client or a reviewing host can discover
	them without an out-of-band link -- see `src/routes/oauth-routes.ts`.

	This content describes what this codebase actually does, not aspirational
	policy. Update it if the code it describes changes -- a page that
	contradicts the code is worse than no page at all, the same standard this
	repository holds every other document to.
-->
<script lang="ts">
	import LegalPageShell from '@web/views/legal-page-shell.svelte';
	import SupportContactNotice from '@web/views/support-contact-notice.svelte';

	let { supportContactEmail }: { supportContactEmail: string | undefined } = $props();
</script>

<LegalPageShell title="Privacy Policy">
	<p>
		This server is a Model Context Protocol (MCP) connector. It authenticates human users with
		Google sign-in and authenticates MCP clients (Claude, Codex, ChatGPT, and similar hosts) with
		OAuth 2.1 access tokens scoped to specific capabilities.
	</p>

	<h2>Data this server collects</h2>
	<ul>
		<li>
			<strong>Account identity</strong>: the email address, display name, and avatar URL Google's
			sign-in flow returns, stored so the same person is recognized across sessions.
		</li>
		<li>
			<strong>Session and OAuth credentials</strong>: every session cookie, authorization code,
			access token, refresh token, and OAuth client secret is stored only as a SHA-256 hash -- the
			plaintext value is never written to the database, and cannot be recovered from a database read
			alone.
		</li>
		<li>
			<strong>Request metadata for abuse prevention</strong>: a coarse network identity (the
			request's IP address, or a value from a configured trusted proxy header) is used transiently
			to enforce rate limits and lockouts; it is not stored beyond the sliding window each control
			uses (typically under a few minutes).
		</li>
		<li>
			<strong>Operational logs</strong>: structured logs record what happened (an event name and
			outcome, a request identifier, a user identifier) -- never a token, password, secret, or the
			raw content of a prompt or tool call. See this repository's own <code>RUNBOOK.md</code> for the
			exact redaction policy.
		</li>
	</ul>
	<p>
		This server does not sell data, does not use it for advertising, and does not share it with any
		party beyond the subprocessors named below and whatever MCP tool call a connected client
		explicitly authorizes.
	</p>

	<h2>Retention and deletion</h2>
	<p>
		Sessions, authorization codes, and access/refresh tokens expire on a fixed schedule and are
		periodically purged once expired or revoked. A user can revoke any connected OAuth client's
		access from their account page at any time, which immediately invalidates that client's
		outstanding tokens. A user may also request deletion of their account by contacting the operator
		at the address below; deletion removes the account row and every session, OAuth grant, and
		consent record tied to it -- no orphaned credential or service identity is left usable
		afterward.
	</p>

	<h2>Subprocessors</h2>
	<p>This deployment depends on the following third-party services to operate:</p>
	<ul>
		<li>
			<strong>Neon</strong> (Postgres database) -- stores account records, hashed credentials, and OAuth
			grant metadata.
		</li>
		<li>
			<strong>A Redis-compatible provider</strong> configured by the operator -- stores short-lived rate-limit
			counters and single-use authentication state; holds no durable data and no plaintext credential.
		</li>
		<li>
			<strong>Railway</strong> (or whichever hosting platform the operator deploys this template to) --
			runs the application process and terminates inbound TLS.
		</li>
		<li>
			<strong>Google</strong> -- provides identity verification for sign-in. This server never receives
			a user's Google password, only Google's signed assertion of who the user is.
		</li>
	</ul>

	<h2>Consent</h2>
	<p>
		When an MCP client requests access, this server's consent screen names the client and the
		specific scopes it is requesting in plain language before any authorization is granted.
		Approving a request grants exactly the scopes shown -- never more -- and can be revoked at any
		time from the account page.
	</p>

	<h2>Contact</h2>
	<SupportContactNotice {supportContactEmail} />
</LegalPageShell>
