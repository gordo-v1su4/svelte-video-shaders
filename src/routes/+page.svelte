<script>
	import { onMount } from 'svelte';
	
	let VideoWorkbench = $state(null);
	let isLoading = $state(true);
	
	onMount(async () => {
		try {
			const module = await import('$lib/VideoWorkbench.svelte');
			VideoWorkbench = module.default;
			isLoading = false;
		} catch (error) {
			console.error('Failed to load VideoWorkbench:', error);
			isLoading = false;
		}
	});
</script>

{#if isLoading}
	<div class="flex items-center justify-center min-h-screen bg-[#111]">
		<div class="text-center">
			<div class="inline-block animate-spin rounded-full h-8 w-8 border-2 border-gray-600 border-t-gray-300 mb-4"></div>
			<p class="text-gray-400">Loading video workbench...</p>
		</div>
	</div>
{:else if VideoWorkbench}
	<VideoWorkbench />
{/if}

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		background: #111;
		overflow: hidden;
	}
</style>
