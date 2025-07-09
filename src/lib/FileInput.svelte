<script>
	import { Button } from 'svelte-tweakpane-ui';

	let { value = $bindable(), title = 'Upload Videos' } = $props();
	
	function triggerFileUpload() {
		console.log('FileInput: triggerFileUpload called');
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'video/*';
		input.multiple = true;
		input.style.display = 'none';
		
		input.onchange = (e) => {
			console.log('FileInput: Files selected:', e.target.files);
			value = Array.from(e.target.files);
		};
		
		document.body.appendChild(input);
		input.click();
		document.body.removeChild(input);
	}
</script>

<Button {title} on:click={triggerFileUpload} />