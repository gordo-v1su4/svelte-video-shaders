<script>
	import { onMount } from 'svelte';
	import { initClerk } from '$lib/clerk.js';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';

	let clerkInstance = $state(null);
	let signUpElement = $state(null);

	onMount(async () => {
		if (browser) {
			clerkInstance = await initClerk();
			
			// If already signed in, redirect to home
			if (clerkInstance?.user) {
				goto('/');
				return;
			}
			
			if (clerkInstance && signUpElement) {
				// Mount Clerk's sign-up component with dark mode appearance
				await clerkInstance.mountSignUp(signUpElement, {
					routing: 'hash',
					redirectUrl: '/',
					afterSignUpUrl: '/',
					appearance: {
						baseTheme: 'dark',
						elements: {
							rootBox: {
								backgroundColor: '#1a1a1a',
								border: '1px solid #333',
								borderRadius: '8px',
								padding: '2rem'
							},
							card: {
								backgroundColor: '#1a1a1a',
								border: '1px solid #333'
							},
							formButtonPrimary: {
								backgroundColor: '#3b82f6',
								color: 'white'
							},
							formFieldInput: {
								backgroundColor: '#222',
								borderColor: '#333',
								color: '#e0e0e0'
							},
							formFieldLabel: {
								color: '#e0e0e0'
							},
							identityPreviewText: {
								color: '#e0e0e0'
							},
							identityPreviewEditButton: {
								color: '#60a5fa'
							},
							socialButtonsBlockButton: {
								backgroundColor: '#222',
								borderColor: '#333',
								color: '#e0e0e0'
							},
							dividerLine: {
								backgroundColor: '#333'
							},
							dividerText: {
								color: '#999'
							},
							footerActionLink: {
								color: '#60a5fa'
							},
							headerTitle: {
								color: '#e0e0e0'
							},
							headerSubtitle: {
								color: '#999'
							}
						}
					}
				});
				
				// Listen for successful sign-up
				clerkInstance.addListener((state) => {
					if (state.user) {
						goto('/');
					}
				});
			}
		}
	});
</script>

<div class="min-h-screen flex items-center justify-center bg-[#111]">
	<div class="max-w-md w-full p-8">
		<div class="mb-8 text-center">
			<h1 class="text-3xl font-bold mb-2 text-[#e0e0e0]">Sign Up</h1>
			<p class="text-sm text-gray-400">Create your account to get started</p>
		</div>
		<div 
			bind:this={signUpElement} 
			id="clerk-sign-up"
			class="clerk-sign-up-container"
		></div>
		<div class="mt-6 text-center space-y-2">
			<p class="text-sm text-gray-400">
				Already have an account? 
				<a href="/sign-in" class="text-blue-400 hover:text-blue-300 transition-colors">Sign in</a>
			</p>
		</div>
	</div>
</div>

<style>
	:global(.clerk-sign-up-container) {
		/* Override Clerk's default light theme */
		--clerk-primary-color: #3b82f6;
		--clerk-text-color: #e0e0e0;
		--clerk-background-color: #1a1a1a;
		--clerk-border-color: #333;
		--clerk-input-background: #222;
		--clerk-input-border: #333;
		--clerk-input-text: #e0e0e0;
	}

	:global(.clerk-sign-up-container *) {
		color: #e0e0e0 !important;
	}

	:global(.clerk-sign-up-container [class*="card"]) {
		background-color: #1a1a1a !important;
		border: 1px solid #333 !important;
		border-radius: 8px !important;
		padding: 2rem !important;
	}

	:global(.clerk-sign-up-container [class*="input"]) {
		background-color: #222 !important;
		border-color: #333 !important;
		color: #e0e0e0 !important;
	}

	:global(.clerk-sign-up-container [class*="input"]:focus) {
		border-color: #3b82f6 !important;
		outline: none !important;
		box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2) !important;
	}

	:global(.clerk-sign-up-container [class*="button"]) {
		background-color: #3b82f6 !important;
		color: white !important;
		border: none !important;
	}

	:global(.clerk-sign-up-container [class*="button"]:hover) {
		background-color: #2563eb !important;
	}

	:global(.clerk-sign-up-container [class*="link"]) {
		color: #60a5fa !important;
	}

	:global(.clerk-sign-up-container [class*="link"]:hover) {
		color: #93c5fd !important;
	}

	:global(.clerk-sign-up-container [class*="divider"]) {
		border-color: #333 !important;
	}

	:global(.clerk-sign-up-container [class*="divider"]::before),
	:global(.clerk-sign-up-container [class*="divider"]::after) {
		background-color: #333 !important;
	}
</style>
