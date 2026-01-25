<script>
	import '../app.css';
	import { onMount } from 'svelte';
	import { initClerk } from '$lib/clerk.js';
	import ClerkAuth from '$lib/ClerkAuth.svelte';
	import ProtectedRoute from '$lib/ProtectedRoute.svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/stores';

	let { children } = $props();

	// Public routes that don't require authentication
	const publicRoutes = ['/sign-in', '/sign-up'];
	const isPublicRoute = $derived(
		publicRoutes.includes($page.url.pathname) || 
		$page.url.pathname.startsWith('/auth')
	);

	// Initialize Clerk on mount
	onMount(async () => {
		if (browser) {
			await initClerk();
		}
	});
</script>

{#if isPublicRoute}
	<!-- Public routes (sign-in, sign-up) - no header, full page -->
	{@render children()}
{:else}
	<!-- Protected routes - require authentication -->
	<ProtectedRoute>
		<div class="min-h-screen">
			<header class="flex justify-end items-center p-4 gap-4 h-16 border-b border-gray-200">
				<ClerkAuth />
			</header>
			<main>
				{@render children()}
			</main>
		</div>
	</ProtectedRoute>
{/if}
