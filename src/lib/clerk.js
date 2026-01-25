import { Clerk } from '@clerk/clerk-js';
import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { PUBLIC_CLERK_PUBLISHABLE_KEY } from '$env/static/public';

// Clerk instance store
export const clerk = writable(null);

// Initialize Clerk
export async function initClerk() {
	if (!browser) return null;
	
	if (!PUBLIC_CLERK_PUBLISHABLE_KEY) {
		console.error('[Clerk] PUBLIC_CLERK_PUBLISHABLE_KEY is not set');
		return null;
	}

	try {
		const clerkInstance = new Clerk(PUBLIC_CLERK_PUBLISHABLE_KEY);
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
