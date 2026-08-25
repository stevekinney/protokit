<script lang="ts">
	let { message = 'Hello' }: { message?: string } = $props();
</script>

<p>{message}</p>
