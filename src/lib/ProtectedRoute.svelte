<script>
	import { onMount } from 'svelte';
	import { initClerk } from './clerk.js';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	let { children } = $props();

	let clerkInstance = $state(null);
	let user = $state(null);
	let isChecking = $state(true);

	onMount(async () => {
		if (!browser) {
			isChecking = false;
			return;
		}

		// Initialize Clerk
		clerkInstance = await initClerk();
		
		if (clerkInstance) {
			// Get initial user state
			user = clerkInstance.user;
			
			// If not authenticated, redirect to auth page
			if (!user) {
				goto('/auth');
				isChecking = false;
				return;
			}

			// Listen for auth state changes
			clerkInstance.addListener((state) => {
				user = state.user;
				
				// If user signs out, redirect to auth page
				if (!state.user) {
					goto('/auth');
				}
			});
		} else {
			// If Clerk failed to initialize, still redirect to auth page
			goto('/auth');
		}
		
		isChecking = false;
	});
</script>

{#if isChecking}
	<!-- Loading state while checking authentication -->
	<div class="min-h-screen flex items-center justify-center bg-gray-50">
		<div class="text-center">
			<div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
			<p class="mt-4 text-gray-600">Loading...</p>
		</div>
	</div>
{:else}
	{@render children()}
{/if}
