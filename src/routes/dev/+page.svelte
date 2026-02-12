<script>
    import { env } from '$env/dynamic/public';
    import { goto } from '$app/navigation';

    let numPlayers = $state(4);
    let seed = $state(42);
    let loading = $state(false);
    let error = $state('');

    async function createAndGenerate() {
        loading = true;
        error = '';
        try {
            // Create game
            const gameRes = await fetch(`${env.FAST_API_URL}/games`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: `Dev Game ${Date.now()}`, num_players: numPlayers }),
            });
            if (!gameRes.ok) throw new Error('Failed to create game');
            const game = await gameRes.json();

            // Generate map
            const mapRes = await fetch(`${env.FAST_API_URL}/games/${game.game_id}/generate-map`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ seed }),
            });
            if (!mapRes.ok) throw new Error('Failed to generate map');

            // Navigate to map
            goto(`/game/${game.game_id}/map`);
        } catch (e) {
            error = e.message;
        } finally {
            loading = false;
        }
    }
</script>

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
        color: #eee;
        font-size: 0.9rem;
    }

    input {
        padding: 6px 10px;
        border: 1px solid #555;
        border-radius: 4px;
        background: #1a1a2e;
        color: #eee;
        width: 80px;
        margin-top: 4px;
    }

    button {
        padding: 8px 16px;
        background: #3498db;
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
        color: red;
        margin-top: 1rem;
    }
</style>
