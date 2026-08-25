<script lang="ts">
	import LegalPageShell from '@web/views/legal-page-shell.svelte';
	import SupportContactNotice from '@web/views/support-contact-notice.svelte';

	let { supportContactEmail }: { supportContactEmail: string | undefined } = $props();
</script>

<LegalPageShell title="Terms of Service">
	<p>
		These terms govern use of this MCP server and its OAuth authorization endpoints. By signing in
		or authorizing an MCP client against this server, you agree to the terms below.
	</p>

	<h2>What this service provides</h2>
	<p>
		An MCP server exposing a small set of tools, resources, and prompts to authenticated MCP clients
		over OAuth 2.1, plus the browser-based sign-in and consent flow that grants that access. The
		exact capabilities offered are described in this server's MCP server instructions and tool
		metadata, discoverable by any connected client.
	</p>

	<h2>Acceptable use</h2>
	<ul>
		<li>
			Do not attempt to bypass, probe, or defeat this server's authentication, rate limiting, or
			scope enforcement.
		</li>
		<li>Do not use a registered OAuth client identity to impersonate another party.</li>
		<li>
			Do not use this service to store, request, or generate content that violates applicable law.
		</li>
	</ul>

	<h2>Availability and changes</h2>
	<p>
		This service is provided on an as-available basis with no uptime guarantee beyond whatever the
		operator's own deployment commits to separately. Tool behavior, scopes, and supported protocol
		revisions may change between deployments; a connected client should re-read this server's
		discovery metadata rather than assume a prior capability set remains fixed.
	</p>

	<h2>Termination</h2>
	<p>
		Either party may end this relationship at any time: a user may revoke a connected client's
		access from the account page, or request deletion of their account by contacting the operator
		(see Contact below), and the operator may revoke or remove any OAuth client's registration,
		which immediately invalidates its outstanding tokens.
	</p>

	<h2>Contact</h2>
	<SupportContactNotice {supportContactEmail} />
</LegalPageShell>
