# Interoperability with `svelte-tweakpane-ui`

This document outlines patterns and solutions for making `svelte-tweakpane-ui` work with other browser features and libraries.

## Triggering a File Upload

The standard method of using a hidden `<input type="file" />` and triggering it from a Tweakpane button is unreliable due to the way Tweakpane handles events and constructs its DOM.

The recommended solution is to use the `tweakpane-plugin-file-import` plugin, which adds a dedicated file input control directly to the Tweakpane pane.

### Steps:

1.  **Install the plugin:**
    ```bash
    pnpm install tweakpane-plugin-file-import
    ```

2.  **Usage:**
    The plugin needs to be integrated into the Tweakpane instance. When using `svelte-tweakpane-ui`, this can be done by creating a wrapper component or by directly using the `pane.registerPlugin` method if you have access to the raw pane object.

    A common pattern is to create a dedicated Svelte component that wraps the plugin's functionality, making it reusable and reactive.

### Example (`FileInput.svelte` component):

A wrapper component can be created to handle the plugin registration and expose a simple interface for file binding.

```svelte
<script>
  import { getContext } from 'svelte';
  import { TweakpaneFileImportPlugin } from 'tweakpane-plugin-file-import';

  let { bind:value, title = 'File' } = $props();
  const { pane } = getContext('svelte-tweakpane-ui');

  // Register the plugin if it hasn't been already
  if (!pane.plugins.file) {
    pane.registerPlugin(TweakpaneFileImportPlugin);
  }

  const params = { file: value };
  const input = pane.addInput(params, 'file', {
    title,
    lineCount: 3,
    filetypes: ['video/*'],
  });

  input.on('change', (e) => {
    value = e.value;
  });
</script>
```

This approach encapsulates the logic and provides a clean, Svelte-native way to add file inputs to a Tweakpane UI.
