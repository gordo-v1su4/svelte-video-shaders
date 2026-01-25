<script>
	import LoginForm from "$lib/components/login-form.svelte";
	import { page } from '$app/stores';
	
	// Get mode from URL query param, default to 'signin'
	const mode = $derived($page.url.searchParams.get('mode') || 'signin');
</script>

<div class="bg-background flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
	<LoginForm {mode} />
</div>
