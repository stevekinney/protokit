<!--
	Deliberately does the one thing the document shell cannot support, so the
	guard in `html-response.ts` has something real to reject. Not reachable
	from any route; lives outside `src/views` and `src/components` so the
	style-entry completeness check does not demand an import for it.
-->
<script lang="ts">
	// Present only so svelte2tsx emits a declaration for this component; a
	// component with no script block cannot be imported from a `.ts` file
	// under `svelte-check`.
</script>

<svelte:head>
	<meta name="fixture" content="this should be rejected" />
</svelte:head>

<p>Body</p>
