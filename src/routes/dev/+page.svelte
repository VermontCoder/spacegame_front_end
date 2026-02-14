<script>
    import { goto } from '$app/navigation';
    import { isAuthenticated, isLoading, apiFetch } from '$lib/auth.svelte.js';

    let numPlayers = $state(4);
    let seed = $state(42);
    let loading = $state(false);
    let error = $state('');

    let authenticated = $derived(isAuthenticated());
    let authLoading = $derived(isLoading());

    $effect(() => {
        if (!authLoading && !authenticated) {
            goto('/');
        }
    });

    async function createAndGenerate() {
        loading = true;
        error = '';
        try {
            // Create game
            const gameRes = await apiFetch('/games', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: `Dev Game ${Date.now()}`, num_players: numPlayers }),
            });
            if (!gameRes.ok) throw new Error('Failed to create game');
            const game = await gameRes.json();

            // Generate map
            const mapRes = await apiFetch(`/games/${game.game_id}/generate-map`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ seed }),
            });
            if (!mapRes.ok) throw new Error('Failed to generate map');

            // Navigate to map
            goto(`/game/${game.game_id}/map`);
        } catch (/** @type {any} */ e) {
            error = e.message;
        } finally {
            loading = false;
        }
    }
</script>

{#if authLoading}
    <p>Loading...</p>
{:else if authenticated}
    <h1>Dev Tools</h1>

    <div class="form">
        <label>
            Players:
            <input type="number" bind:value={numPlayers} min="2" max="8" />
        </label>
        <label>
            Seed:
            <input type="number" bind:value={seed} />
        </label>
        <button onclick={createAndGenerate} disabled={loading}>
            {loading ? 'Generating...' : 'Create Game & Generate Map'}
        </button>
    </div>

    {#if error}
        <p class="error">{error}</p>
    {/if}
{/if}

<style>
    .form {
        display: flex;
        gap: 1rem;
        align-items: flex-end;
        margin-top: 1rem;
    }

    label {
        display: flex;
        flex-direction: column;
        font-size: 0.9rem;
    }

    input {
        padding: 6px 10px;
        border: 1px solid var(--color-border-light);
        border-radius: 4px;
        background: var(--color-bg-panel);
        color: var(--color-text);
        width: 80px;
        margin-top: 4px;
    }

    button {
        padding: 8px 16px;
        background: var(--color-link);
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    }

    button:hover {
        background: #2980b9;
    }

    button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .error {
        color: var(--color-error);
        margin-top: 1rem;
    }
</style>
