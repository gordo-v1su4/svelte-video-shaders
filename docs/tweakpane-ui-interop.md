# Interoperability with `svelte-tweakpane-ui`

This document outlines patterns and solutions for making `svelte-tweakpane-ui` work with other browser features and libraries.

## Enhanced Tweakpane Integration

### Dependencies

Current project includes these Tweakpane packages:
- `svelte-tweakpane-ui` ^1.5.9 - Main Svelte wrapper
- `tweakpane` ^4.0.5 - Core Tweakpane library  
- `tweakpane-plugin-file-import` ^1.1.1 - File upload plugin
- `@tweakpane/plugin-essentials` ^0.2.1 - Essential plugins (CubicBezier, etc.)

### File Upload Integration

The standard method of using a hidden `<input type="file" />` and triggering it from a Tweakpane button is unreliable due to the way Tweakpane handles events and constructs its DOM.

**✅ Recommended Solution:** Use `tweakpane-plugin-file-import` with a Svelte wrapper component.

### Implementation (`src/lib/FileInput.svelte`):

```svelte
<script>
  import { getContext, onMount } from 'svelte';
  import { TweakpaneFileImportPlugin } from 'tweakpane-plugin-file-import';

  let { value = $bindable(), title = 'Upload Videos', multiple = true } = $props();
  
  const { pane } = getContext('svelte-tweakpane-ui');
  let input;

  onMount(() => {
    // Register the plugin if it hasn't been already
    if (!pane.plugins.file) {
      pane.registerPlugin(TweakpaneFileImportPlugin);
    }

    const params = { file: value };
    input = pane.addInput(params, 'file', {
      title,
      lineCount: 3,
      filetypes: ['video/*'],
      multiple
    });

    input.on('change', (e) => {
      value = e.value;
    });

    return () => {
      if (input) {
        pane.remove(input);
      }
    };
  });
</script>
```

### Advanced Controls

#### Theme Picker
```svelte
<script>
  import { ThemeUtils } from 'svelte-tweakpane-ui';
  let theme = $state('dark');
</script>

<Pane {theme}>
  <ThemeUtils.Selector bind:theme />
  <!-- Other controls -->
</Pane>
```

#### Essential Plugins
```svelte
<script>
  import { CubicBezierPlugin } from '@tweakpane/plugin-essentials';
  
  let animationCurve = $state({ x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 });
</script>

<!-- CubicBezier control integration pending svelte-tweakpane-ui support -->
```

### Button Event Handling

**⚠️ Issue:** `svelte-tweakpane-ui` does not support Svelte 5's new `onclick` syntax and requires Svelte 4-style event handling.

**✅ Solution:** Use Svelte 4 event syntax with Tweakpane components:

```svelte
<!-- ✅ Good: Svelte 4 event syntax (works with svelte-tweakpane-ui) -->
<Button title="Apply Shader" on:click={applyCustomShader} />

<!-- ❌ Bad: Svelte 5 syntax (doesn't work with current svelte-tweakpane-ui) -->
<Button title="Apply Shader" onclick={applyCustomShader} />

<!-- ✅ Good: For regular HTML elements, use Svelte 5 syntax -->
<div onclick={handleClick} role="button">Click me</div>
```

**Key Finding:** The library hasn't fully migrated to Svelte 5 event handling patterns yet.

### Integration Patterns

#### File Upload with Reactive Handling
```svelte
<script>
  let uploadedFiles = $state(null);
  
  // React to file changes
  $effect(() => {
    if (uploadedFiles) {
      handleFileUpload({ target: { files: uploadedFiles } });
    }
  });
</script>

<FileInput bind:value={uploadedFiles} title="Upload Videos" />
```

#### Complete Control Panel Structure
```svelte
<Pane title="Video Shader Controls" position="fixed" theme={theme}>
  <!-- File Upload -->
  <FileInput bind:value={uploadedFiles} title="Upload Videos" />
  
  <!-- Theme Control -->
  <ThemeUtils.Selector bind:theme />
  
  <!-- Parameter Controls -->
  <Slider bind:value={uniforms.u_strength.value} label="Strength" min={0} max={1} step={0.01} />
  <Color bind:value={uniforms.u_vignette_color.value} label="Vignette Color" />
  <Point bind:value={uniforms.u_vignette_center.value} label="Vignette Center" />
  
  <!-- Tabbed Sections -->
  <TabGroup>
    <TabPage title="Presets">
      {#each Object.keys(shaders) as name}
        <Button title={name} onclick={() => selectShader(name)} />
      {/each}
    </TabPage>
    <TabPage title="Custom">
      <Textarea bind:value={customShaderSrc} title="GLSL Code" rows={15} />
      <Button title="Apply Custom Shader" onclick={applyCustomShader} />
    </TabPage>
  </TabGroup>
</Pane>
```

### Best Practices

1. **Plugin Registration**: Always check if plugins are already registered before registering again
2. **Cleanup**: Use `onMount` return function to clean up Tweakpane inputs when components unmount
3. **Event Handling**: Use direct function references for button events rather than arrow functions
4. **State Management**: Use Svelte 5 `$state` and `$effect` for reactive updates
5. **File Handling**: Use reactive effects to handle file upload events from the FileInput component

### Migration Notes

**Before (Unreliable):**
```javascript
function triggerFileUpload() {
  const input = document.createElement('input');
  input.type = 'file';
  input.style.display = 'none';
  input.onchange = handleFileUpload;
  document.body.appendChild(input);
  input.click();
  document.body.removeChild(input);
}
```

**After (Reliable):**
```svelte
<!-- FileInput.svelte -->
<script>
  import { Button } from 'svelte-tweakpane-ui';
  
  let { value = $bindable(), title = 'Upload Videos' } = $props();
  
  function triggerFileUpload() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.multiple = true;
    input.style.display = 'none';
    
    input.onchange = (e) => {
      value = Array.from(e.target.files);
    };
    
    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
  }
</script>

<Button {title} on:click={triggerFileUpload} />
```

**Final Implementation:** Simple Button component with hidden input pattern works reliably and integrates properly with Tweakpane's event system using Svelte 4 syntax.
