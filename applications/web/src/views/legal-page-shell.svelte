<script lang="ts">
	import type { Snippet } from 'svelte';

	let { title, children }: { title: string; children: Snippet } = $props();
</script>

<main class="page stack">
	<p><a href="/">&larr; Back to home</a></p>
	<article class="cinder-markdown-content">
		<h1>{title}</h1>
		{@render children()}
	</article>
</main>
