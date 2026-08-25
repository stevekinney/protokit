<script lang="ts">
	let { supportContactEmail }: { supportContactEmail: string | undefined } = $props();
</script>

{#if supportContactEmail}
	<p>Contact <a href="mailto:{supportContactEmail}">{supportContactEmail}</a>.</p>
{:else}
	<p>
		This deployment has not configured a support contact. The operator running this server should
		set <code>SUPPORT_CONTACT_EMAIL</code> in its environment.
	</p>
{/if}
