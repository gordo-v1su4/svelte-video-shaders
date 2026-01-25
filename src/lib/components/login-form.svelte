<script>
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import {
		FieldGroup,
		Field,
		FieldLabel,
		FieldDescription,
	} from "$lib/components/ui/field/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { cn } from "$lib/utils.js";
	import { initClerk } from '$lib/clerk.js';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	let { class: className, mode = 'signin', ...restProps } = $props();
	const id = $props.id();

	let clerkInstance = $state(null);
	let isLoading = $state(false);
	let error = $state('');
	let showPassword = $state(false);
	let showConfirmPassword = $state(false);

	// Sign In fields
	let email = $state('');
	let password = $state('');

	// Sign Up fields
	let fullName = $state('');
	let confirmPassword = $state('');

	onMount(async () => {
		if (browser) {
			clerkInstance = await initClerk();
			
			if (clerkInstance?.user) {
				goto('/');
			}
		}
	});

	async function handleSignIn(e) {
		e.preventDefault();
		error = '';
		isLoading = true;
		
		try {
			if (!clerkInstance) throw new Error('Clerk not initialized');
			
			const signIn = await clerkInstance.client.signIn.create({
				identifier: email
			});
			
			const result = await signIn.attemptFirstFactor({
				strategy: 'password',
				password: password
			});
			
			if (result.status === 'complete') {
				await clerkInstance.setActive({ session: result.createdSessionId });
				goto('/');
			} else {
				error = 'Please check your credentials';
			}
		} catch (err) {
			console.error('Sign in error:', err);
			error = err.errors?.[0]?.message || err.message || 'Failed to sign in';
		} finally {
			isLoading = false;
		}
	}

	async function handleSignUp(e) {
		e.preventDefault();
		error = '';
		
		if (password !== confirmPassword) {
			error = 'Passwords do not match';
			return;
		}
		
		isLoading = true;
		
		try {
			if (!clerkInstance) throw new Error('Clerk not initialized');
			
			// Split full name into first and last
			const nameParts = fullName.trim().split(' ');
			const firstName = nameParts[0] || '';
			const lastName = nameParts.slice(1).join(' ') || '';
			
			const signUp = await clerkInstance.client.signUp.create({
				emailAddress: email,
				password: password,
				firstName: firstName,
				lastName: lastName
			});
			
			if (signUp.status === 'complete') {
				await clerkInstance.setActive({ session: signUp.createdSessionId });
				goto('/');
			} else if (signUp.status === 'missing_requirements') {
				error = 'Please check your email to verify your account';
			} else {
				error = 'Account creation in progress';
			}
		} catch (err) {
			console.error('Sign up error:', err);
			error = err.errors?.[0]?.message || err.message || 'Failed to create account';
		} finally {
			isLoading = false;
		}
	}

	async function handleSocialAuth(provider) {
		if (!clerkInstance) {
			error = 'Authentication not ready. Please try again.';
			return;
		}
		
		error = '';
		isLoading = true;
		
		try {
			// Use Clerk's built-in redirect OAuth flow
			const redirectUrl = window.location.origin + '/auth/sso-callback';
			const redirectUrlComplete = window.location.origin + '/';
			
			await clerkInstance.client.signIn.authenticateWithRedirect({
				strategy: `oauth_${provider}`,
				redirectUrl: redirectUrl,
				redirectUrlComplete: redirectUrlComplete
			});
		} catch (err) {
			console.error(`Social auth error (${provider}):`, err);
			
			// Check if it's a provider not configured error
			const errorMessage = err.errors?.[0]?.longMessage || err.errors?.[0]?.message || err.message || '';
			
			if (errorMessage.includes('does not match one of the allowed values')) {
				error = `${provider.charAt(0).toUpperCase() + provider.slice(1)} sign-in is not configured. Please enable it in the Clerk dashboard.`;
			} else {
				error = errorMessage || `Failed to authenticate with ${provider}`;
			}
			isLoading = false;
		}
	}
</script>

<div class={cn("flex flex-col gap-4 w-full max-w-md", className)} {...restProps}>
	<!-- App Title -->
	<div class="text-center mb-2">
		<h1 class="text-3xl font-bold tracking-tight">
			<span class="text-muted-foreground italic">video</span><span class="text-foreground">.SHADERS</span>
		</h1>
	</div>

	<!-- Tab buttons -->
	<div class="flex rounded-lg bg-secondary/50 p-1">
		<a 
			href="/auth?mode=signin"
			class={cn(
				"flex-1 py-2 text-center text-sm font-medium rounded-md transition-colors",
				mode === 'signin' 
					? "bg-background text-foreground shadow-sm" 
					: "text-muted-foreground hover:text-foreground"
			)}
		>
			Sign In
		</a>
		<a 
			href="/auth?mode=signup"
			class={cn(
				"flex-1 py-2 text-center text-sm font-medium rounded-md transition-colors",
				mode === 'signup' 
					? "bg-background text-foreground shadow-sm" 
					: "text-muted-foreground hover:text-foreground"
			)}
		>
			Sign Up
		</a>
	</div>

	<!-- Card -->
	<Card.Root class="border-border/50">
		<Card.Header class="pb-3">
			<Card.Title class="text-xl">
				{mode === 'signin' ? 'Welcome back' : 'Create an account'}
			</Card.Title>
			<Card.Description class="text-sm">
				{mode === 'signin' 
					? 'Enter your credentials to access your account' 
					: 'Enter your details to get started with Video Shaders'}
			</Card.Description>
		</Card.Header>
		<Card.Content class="pt-0">
			<form onsubmit={mode === 'signin' ? handleSignIn : handleSignUp} class="space-y-3">
				{#if mode === 'signup'}
				<Field>
					<FieldLabel for="fullname-{id}" class="text-sm font-medium">Full Name</FieldLabel>
					<input 
						id="fullname-{id}" 
						type="text" 
						placeholder="John Doe" 
						required 
						bind:value={fullName}
						class="flex h-9 w-full rounded-md border border-border/80 bg-input/80 px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring"
					/>
				</Field>
				{/if}
				
				<Field>
					<FieldLabel for="email-{id}" class="text-sm font-medium">Email</FieldLabel>
					<input 
						id="email-{id}" 
						type="email" 
						placeholder="name@example.com" 
						required 
						bind:value={email}
						class="flex h-9 w-full rounded-md border border-border/80 bg-input/80 px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring"
					/>
				</Field>
				
				<Field>
					<div class="flex items-center justify-between">
						<FieldLabel for="password-{id}" class="text-sm font-medium">Password</FieldLabel>
						{#if mode === 'signin'}
						<button type="button" class="text-xs text-muted-foreground hover:text-foreground transition-colors">
							Forgot password?
						</button>
						{/if}
					</div>
					<div class="relative">
						<input 
							id="password-{id}" 
							type={showPassword ? "text" : "password"} 
							required 
							bind:value={password} 
							placeholder={mode === 'signup' ? 'Create a password' : 'Enter your password'}
							class="flex h-9 w-full rounded-md border border-border/80 bg-input/80 px-3 py-1 pr-9 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring"
						/>
						<button
							type="button"
							onclick={() => showPassword = !showPassword}
							class="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
						>
							{#if showPassword}
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
									<line x1="1" y1="1" x2="23" y2="23"/>
								</svg>
							{:else}
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
									<circle cx="12" cy="12" r="3"/>
								</svg>
							{/if}
						</button>
					</div>
				</Field>

				{#if mode === 'signup'}
				<Field>
					<FieldLabel for="confirm-password-{id}" class="text-sm font-medium">Confirm Password</FieldLabel>
					<div class="relative">
						<input 
							id="confirm-password-{id}" 
							type={showConfirmPassword ? "text" : "password"} 
							required 
							bind:value={confirmPassword} 
							placeholder="Confirm your password"
							class="flex h-9 w-full rounded-md border border-border/80 bg-input/80 px-3 py-1 pr-9 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring"
						/>
						<button
							type="button"
							onclick={() => showConfirmPassword = !showConfirmPassword}
							class="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
						>
							{#if showConfirmPassword}
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
									<line x1="1" y1="1" x2="23" y2="23"/>
								</svg>
							{:else}
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
									<circle cx="12" cy="12" r="3"/>
								</svg>
							{/if}
						</button>
					</div>
				</Field>
				{/if}
				
				{#if error}
				<div class="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-2">
					{error}
				</div>
				{/if}
				
				<Button type="submit" class="w-full h-9" disabled={isLoading}>
					{#if isLoading}
						<svg class="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
						</svg>
						{mode === 'signin' ? 'Signing in...' : 'Creating account...'}
					{:else}
						{mode === 'signin' ? 'Sign In' : 'Create Account'}
					{/if}
				</Button>

				<!-- Divider -->
				<div class="relative my-1">
					<div class="absolute inset-0 flex items-center">
						<div class="w-full border-t border-border/50"></div>
					</div>
					<div class="relative flex justify-center text-[10px] uppercase tracking-wider">
						<span class="bg-card px-2 text-muted-foreground">Or continue with</span>
					</div>
				</div>

				<!-- Social buttons -->
				<div class="grid grid-cols-2 gap-2">
					<Button 
						variant="outline" 
						type="button"
						class="h-9"
						onclick={() => handleSocialAuth('github')} 
						disabled={isLoading}
					>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
							<path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
						</svg>
						GitHub
					</Button>
					<Button 
						variant="outline" 
						type="button"
						class="h-9"
						onclick={() => handleSocialAuth('google')} 
						disabled={isLoading}
					>
						<svg width="14" height="14" viewBox="0 0 24 24">
							<path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
							<path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
							<path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
							<path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
						</svg>
						Google
					</Button>
				</div>

				{#if mode === 'signup'}
				<p class="text-[11px] text-center text-muted-foreground pt-1">
					By creating an account, you agree to our <a href="/terms" class="underline hover:text-foreground">Terms of Service</a> and <a href="/privacy" class="underline hover:text-foreground">Privacy Policy</a>
				</p>
				{/if}
			</form>
		</Card.Content>
	</Card.Root>
</div>
