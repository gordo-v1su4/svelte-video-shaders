<script>
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { initClerk } from '$lib/clerk.js';

	let error = $state('');
	let isLoading = $state(true);

	onMount(async () => {
		if (!browser) return;

		try {
			const clerkInstance = await initClerk();
			
			if (!clerkInstance) {
				throw new Error('Failed to initialize authentication');
			}

			// Handle the OAuth callback
			// Clerk will automatically process the callback and set the session
			await clerkInstance.handleRedirectCallback();
			
			// Redirect to home page after successful auth
			goto('/');
		} catch (err) {
			console.error('SSO callback error:', err);
			error = err.message || 'Authentication failed. Please try again.';
			isLoading = false;
		}
	});
</script>

<div class="bg-background flex min-h-svh flex-col items-center justify-center p-6">
	{#if isLoading}
		<div class="text-center">
			<div class="inline-block animate-spin rounded-full h-8 w-8 border-2 border-muted-foreground border-t-foreground mb-4"></div>
			<p class="text-muted-foreground">Completing sign in...</p>
		</div>
	{:else if error}
		<div class="text-center max-w-md">
			<p class="text-destructive mb-4">{error}</p>
			<a href="/auth" class="text-primary hover:underline">Return to sign in</a>
		</div>
	{/if}
</div>
