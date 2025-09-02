<script>
  import { onMount } from 'svelte';
  let Workbench = null;
  let error = null;
  let loading = true;

  onMount(async () => {
    try {
      const mod = await import('$lib/VideoWorkbench.svelte');
      Workbench = mod.default;
    } catch (e) {
      error = e;
      console.error('Failed to load VideoWorkbench:', e);
    } finally {
      loading = false;
    }
  });
</script>

{#if Workbench}
  <svelte:component this={Workbench} />
{:else if error}
  <div class="loading">
    <h3>Failed to load UI</h3>
    <pre>{String(error)}</pre>
  </div>
{:else}
  <div class="loading">
    <h3>Loading UI…</h3>
  </div>
{/if}

<style>
  .loading {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #1a1a1a;
    color: #fff;
    text-align: center;
  }
</style>









