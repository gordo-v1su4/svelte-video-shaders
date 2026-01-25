<script>
	import { onMount } from 'svelte';
	import { clerk, initClerk, getSignInUrl, getSignUpUrl } from './clerk.js';
	import { browser } from '$app/environment';

	let clerkInstance = $state(null);
	let user = $state(null);
	let isLoaded = $state(false);

	onMount(async () => {
		if (browser) {
			clerkInstance = await initClerk();
			if (clerkInstance) {
				// Listen for auth state changes
				clerkInstance.addListener((state) => {
					user = state.user;
					isLoaded = true;
				});
				// Get initial user state
				user = clerkInstance.user;
				isLoaded = true;
			}
		}
	});

	function openSignIn() {
		window.location.href = '/auth';
	}

	function openSignUp() {
		window.location.href = '/auth';
	}

	async function openUserProfile() {
		if (clerkInstance && user) {
			// Open user profile modal
			await clerkInstance.openUserProfile();
		}
	}

	async function signOut() {
		if (clerkInstance) {
			await clerkInstance.signOut();
			window.location.href = '/';
		}
	}
</script>

{#if isLoaded}
	<div class="clerk-auth">
		{#if user}
			<!-- Signed in -->
			<div class="flex items-center gap-4">
				<button
					onclick={openUserProfile}
					class="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-sm font-medium transition-colors"
				>
					{user.firstName || user.emailAddresses[0]?.emailAddress || 'Account'}
				</button>
				<button
					onclick={signOut}
					class="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-md text-sm font-medium transition-colors"
				>
					Sign Out
				</button>
			</div>
		{:else}
			<!-- Signed out -->
			<div class="flex items-center gap-4">
				<button
					onclick={openSignIn}
					class="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md text-sm font-medium transition-colors"
				>
					Sign In
				</button>
				<button
					onclick={openSignUp}
					class="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-md text-sm font-medium transition-colors"
				>
					Sign Up
				</button>
			</div>
		{/if}
	</div>
{/if}
