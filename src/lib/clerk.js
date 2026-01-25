import { writable } from 'svelte/store';
import { browser } from '$app/environment';

// Clerk instance store
export const clerk = writable(null);

// Lazy-load Clerk - only import when actually needed
let ClerkClass = null;
async function loadClerk() {
	if (!ClerkClass) {
		const clerkModule = await import('@clerk/clerk-js');
		ClerkClass = clerkModule.Clerk;
	}
	return ClerkClass;
}

// Get the publishable key - use dynamic import to avoid build-time errors
// Supports both SvelteKit naming (PUBLIC_) and Next.js naming (NEXT_PUBLIC_)
async function getPublishableKey() {
	try {
		const { env } = await import('$env/dynamic/public');
		return env.PUBLIC_CLERK_PUBLISHABLE_KEY || env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
	} catch {
		return null;
	}
}

// Initialize Clerk
export async function initClerk() {
	if (!browser) return null;
	
	const publishableKey = await getPublishableKey();
	
	if (!publishableKey) {
		console.error('[Clerk] PUBLIC_CLERK_PUBLISHABLE_KEY is not set. Add it to your environment variables.');
		return null;
	}

	try {
		const Clerk = await loadClerk();
		const clerkInstance = new Clerk(publishableKey);
		await clerkInstance.load();
		clerk.set(clerkInstance);
		return clerkInstance;
	} catch (error) {
		console.error('[Clerk] Failed to initialize:', error);
		return null;
	}
}

// Get current user
export async function getCurrentUser() {
	if (!browser) return null;
	
	const clerkInstance = await new Promise((resolve) => {
		const unsubscribe = clerk.subscribe((instance) => {
			unsubscribe();
			resolve(instance);
		});
	});
	
	return clerkInstance?.user || null;
}

// Helper to get sign-in URL (for redirect-based auth if needed)
export function getSignInUrl() {
	if (typeof window === 'undefined') return '/auth';
	return '/auth';
}

// Helper to get sign-up URL
export function getSignUpUrl() {
	if (typeof window === 'undefined') return '/auth';
	return '/auth';
}
