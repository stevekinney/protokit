<script lang="ts">
	import LegalPageShell from '@web/views/legal-page-shell.svelte';
	import SupportContactNotice from '@web/views/support-contact-notice.svelte';

	let { supportContactEmail }: { supportContactEmail: string | undefined } = $props();
</script>

<LegalPageShell title="Support">
	<p>
		For a connector-specific problem -- an OAuth authorization failure, a tool returning an
		unexpected error, or a question about what a scope grants -- the fastest path is usually the
		connecting client's own error message: this server's OAuth error responses and MCP tool errors
		are written to be readable on their own, and never reference a case number or internal ticketing
		system this page would otherwise need to explain.
	</p>

	<h2>Removing a connector</h2>
	<p>
		Sign in to this server's home page and use the account page's connection management to revoke a
		specific client's access, or revoke every connected client at once. This immediately invalidates
		that client's outstanding access and refresh tokens.
	</p>

	<h2>Reporting a security issue</h2>
	<p>
		If you believe you have found a security vulnerability in this server, do not open a public
		issue -- contact the address below directly with what you found and how to reproduce it.
	</p>

	<h2>Everything else</h2>
	<SupportContactNotice {supportContactEmail} />
</LegalPageShell>
