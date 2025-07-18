<script lang="ts">
  import { onMount } from 'svelte';
  import { StateService } from '../services/StateService';

  export let showDetails = false;

  let error: Error | null = null;
  let errorInfo: any = null;
  let stateService: StateService;

  onMount(() => {
    stateService = StateService.getInstance();
  });

  function handleReset() {
    error = null;
    errorInfo = null;
    stateService.clearError();
  }

  function toggleDetails() {
    showDetails = !showDetails;
  }
</script>

{#if $error}
  <div class="error-boundary">
    <div class="error-message">
      <h2>Something went wrong</h2>
      <p>{error.message}</p>

      <button on:click={toggleDetails} class="details-button">
        {showDetails ? 'Hide Details' : 'Show Details'}
      </button>

      {#if showDetails}
        <div class="error-details">
          <pre>{error.stack || 'No stack trace available'}</pre>
          {#if errorInfo?.componentStack}
            <h4>Component Stack:</h4>
            <pre>{errorInfo.componentStack}</pre>
          {/if}
        </div>
      {/if}

      <div class="actions">
        <button on:click={handleReset} class="reset-button">
          Try Again
        </button>
      </div>
    </div>
  </div>

  <style>
    .error-boundary {
      padding: 1rem;
      border: 1px solid #ff6b6b;
      border-radius: 4px;
      background-color: #fff5f5;
      margin: 1rem 0;
    }

    .error-message {
      color: #e53e3e;
    }

    .details-button, .reset-button {
      margin-top: 0.5rem;
      padding: 0.5rem 1rem;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.9rem;
    }

    .details-button {
      background: #e2e8f0;
      color: #4a5568;
      margin-right: 0.5rem;
    }

    .reset-button {
      background: #4299e1;
      color: white;
    }

    .error-details {
      margin-top: 1rem;
      padding: 0.5rem;
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      max-height: 300px;
      overflow: auto;
      font-size: 0.8rem;
    }

    pre {
      white-space: pre-wrap;
      word-wrap: break-word;
      margin: 0;
    }
  </style>
{/if}

<slot />
