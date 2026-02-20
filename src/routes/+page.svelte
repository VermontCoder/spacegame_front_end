<script>
    import { goto } from '$app/navigation';
    import { env } from '$env/dynamic/public';
    import { isAuthenticated, isLoading, getUser, register, login, logout, apiFetch } from '$lib/auth.svelte.js';

    let mode = $state('login');
    let username = $state('');
    let password = $state('');
    let firstName = $state('');
    let lastName = $state('');
    let email = $state('');
    let error = $state('');
    let submitting = $state(false);

    let authenticated = $derived(isAuthenticated());
    let authLoading = $derived(isLoading());
    let user = $derived(getUser());

    // Lobby state
    /** @type {any[]} */
    let games = $state([]);
    let lobbyLoading = $state(false);
    let lobbyError = $state('');
    let showCreateModal = $state(false);
    let newGameName = $state('');
    let newGamePlayers = $state(4);
    let creating = $state(false);

    let isDev = $derived(env.FAST_API_URL?.includes('localhost') || env.FAST_API_URL?.includes('127.0.0.1'));

    let myGames = $derived(games.filter(g => g.is_member));
    let joinableGames = $derived(games.filter(g => !g.is_member && g.status === 'open'));
    let otherGames = $derived(games.filter(g => !g.is_member && g.status !== 'open'));

    // Game detail panel state
    /** @type {number|null} */
    let selectedGameId = $state(null);
    /** @type {any[]} */
    let selectedPlayers = $state([]);
    let selectedGame = $derived(games.find(g => g.game_id === selectedGameId) ?? null);

    /** @param {number} gameId */
    async function toggleGameDetail(gameId) {
        if (selectedGameId === gameId) {
            selectedGameId = null;
            selectedPlayers = [];
            return;
        }
        selectedGameId = gameId;
        selectedPlayers = [];
        try {
            const res = await apiFetch(`/games/${gameId}/players`);
            if (res.ok) {
                selectedPlayers = await res.json();
            }
        } catch { /* ignore */ }
    }

    $effect(() => {
        if (authenticated) {
            loadGames();
        }
    });

    async function loadGames() {
        lobbyLoading = true;
        lobbyError = '';
        try {
            const res = await apiFetch('/games');
            if (res.ok) {
                games = await res.json();
            } else {
                lobbyError = 'Failed to load games';
            }
        } catch {
            lobbyError = 'Failed to load games';
        }
        lobbyLoading = false;
    }

    function openCreateModal() {
        newGameName = `${user?.username}'s game`;
        newGamePlayers = 4;
        showCreateModal = true;
    }

    async function createGame() {
        creating = true;
        lobbyError = '';
        try {
            const res = await apiFetch('/games', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newGameName, num_players: newGamePlayers }),
            });
            if (res.ok) {
                showCreateModal = false;
                await loadGames();
            } else {
                const data = await res.json();
                lobbyError = data.detail || 'Failed to create game';
            }
        } catch {
            lobbyError = 'Failed to create game';
        }
        creating = false;
    }

    async function expressStart() {
        creating = true;
        lobbyError = '';
        try {
            const res = await apiFetch('/games/express-start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newGameName, num_players: newGamePlayers }),
            });
            if (res.ok) {
                const data = await res.json();
                showCreateModal = false;
                goto(`/game/${data.game_id}/map`);
            } else {
                const data = await res.json();
                lobbyError = data.detail || 'Express start failed';
            }
        } catch {
            lobbyError = 'Express start failed';
        }
        creating = false;
    }

    /** @param {number} gameId */
    async function joinGame(gameId) {
        lobbyError = '';
        try {
            const res = await apiFetch(`/games/${gameId}/join`, { method: 'POST' });
            if (res.ok) {
                const data = await res.json();
                if (data.status === 'active') {
                    goto(`/game/${gameId}/map`);
                } else {
                    await loadGames();
                }
            } else {
                const data = await res.json();
                lobbyError = data.detail || 'Failed to join game';
            }
        } catch {
            lobbyError = 'Failed to join game';
        }
    }

    async function handleSubmit() {
        error = '';
        submitting = true;
        try {
            if (mode === 'register') {
                await register(username, firstName, lastName, email, password);
            } else {
                await login(username, password);
            }
        } catch (/** @type {any} */ e) {
            error = e.message;
        } finally {
            submitting = false;
        }
    }
</script>

{#if authLoading}
    <div class="loading">Loading...</div>
{:else if authenticated}
    <div class="lobby">
        <div class="lobby-header">
            <h1>Game Lobby</h1>
            <button class="btn btn-create" onclick={openCreateModal}>Create Game</button>
        </div>

        {#if lobbyError}
            <p class="error">{lobbyError}</p>
        {/if}

        {#if lobbyLoading}
            <p class="loading-text">Loading games...</p>
        {:else}
            <div class="lobby-body">
                <div class="game-list">
                    {#each myGames as game (game.game_id)}
                        <div class="game-row my-game" class:selected={selectedGameId === game.game_id}>
                            <span class="game-name" role="button" tabindex="0" onclick={() => toggleGameDetail(game.game_id)} onkeydown={(e) => e.key === 'Enter' && toggleGameDetail(game.game_id)}>{game.name}</span>
                            <span class="game-players">{game.player_count}/{game.num_players}</span>
                            <span class="badge badge-{game.status}">{game.status}</span>
                            <span class="game-actions">
                                {#if game.status === 'open'}
                                    <span class="waiting-text">Waiting...</span>
                                {:else if game.status === 'active'}
                                    <a href="/game/{game.game_id}/map" class="btn btn-enter">Enter Game</a>
                                {:else}
                                    <a href="/game/{game.game_id}/map" class="btn btn-view">View</a>
                                {/if}
                            </span>
                        </div>
                    {/each}

                    {#each joinableGames as game (game.game_id)}
                        <div class="game-row joinable-game" class:selected={selectedGameId === game.game_id}>
                            <span class="game-name" role="button" tabindex="0" onclick={() => toggleGameDetail(game.game_id)} onkeydown={(e) => e.key === 'Enter' && toggleGameDetail(game.game_id)}>{game.name}</span>
                            <span class="game-players">{game.player_count}/{game.num_players}</span>
                            <span class="game-creator">by {game.creator_username}</span>
                            <span class="game-actions">
                                <button class="btn btn-join" onclick={() => joinGame(game.game_id)}>Join</button>
                            </span>
                        </div>
                    {/each}

                    {#each otherGames as game (game.game_id)}
                        <div class="game-row other-game" class:selected={selectedGameId === game.game_id}>
                            <span class="game-name" role="button" tabindex="0" onclick={() => toggleGameDetail(game.game_id)} onkeydown={(e) => e.key === 'Enter' && toggleGameDetail(game.game_id)}>{game.name}</span>
                            <span class="game-players">{game.player_count}/{game.num_players}</span>
                            <span class="badge badge-{game.status}">{game.status}</span>
                            <span class="game-actions">
                                {#if game.status === 'active' || game.status === 'map_generated' || game.status === 'completed'}
                                    <a href="/game/{game.game_id}/map" class="btn btn-spectate">Spectate</a>
                                {/if}
                            </span>
                        </div>
                    {/each}

                    {#if games.length === 0}
                        <p class="empty-text">No games yet. Create one to get started!</p>
                    {/if}
                </div>

                {#if selectedGame}
                    <div class="detail-panel">
                        <h3>{selectedGame.name}</h3>
                        <p class="detail-meta">{selectedGame.player_count}/{selectedGame.num_players} players &middot; <span class="badge badge-{selectedGame.status}">{selectedGame.status}</span></p>
                        <h4>Players</h4>
                        {#if selectedPlayers.length > 0}
                            <ul class="player-list">
                                {#each selectedPlayers as p}
                                    <li><span class="player-index">{p.player_index}.</span> {p.username}</li>
                                {/each}
                            </ul>
                        {:else}
                            <p class="detail-loading">Loading...</p>
                        {/if}
                    </div>
                {/if}
            </div>
        {/if}
    </div>

    {#if showCreateModal}
        <div class="modal-backdrop" onclick={() => showCreateModal = false} role="presentation">
            <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-label="Create Game">
                <h2>Create Game</h2>
                <label>
                    Game Name
                    <input type="text" bind:value={newGameName} />
                </label>
                <label>
                    Number of Players
                    <select bind:value={newGamePlayers}>
                        {#each [2, 3, 4, 5, 6, 7, 8] as n}
                            <option value={n}>{n}</option>
                        {/each}
                    </select>
                </label>
                <div class="modal-actions">
                    <button class="btn btn-create" onclick={createGame} disabled={creating}>
                        {creating ? 'Creating...' : 'Create Game'}
                    </button>
                    {#if isDev}
                        <button class="btn btn-express" onclick={expressStart} disabled={creating}>
                            {creating ? 'Starting...' : 'Express Start'}
                        </button>
                    {/if}
                    <button class="btn btn-cancel" onclick={() => showCreateModal = false}>Cancel</button>
                </div>
            </div>
        </div>
    {/if}
{:else}
    <div class="auth-container">
        <h1>SpaceGame</h1>

        <div class="mode-toggle">
            <button class:active={mode === 'login'} onclick={() => { mode = 'login'; error = ''; }}>
                Log In
            </button>
            <button class:active={mode === 'register'} onclick={() => { mode = 'register'; error = ''; }}>
                Register
            </button>
        </div>

        <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
            <label>
                Username
                <input type="text" bind:value={username} required autocomplete="username" />
            </label>

            {#if mode === 'register'}
                <label>
                    First Name
                    <input type="text" bind:value={firstName} required />
                </label>
                <label>
                    Last Name
                    <input type="text" bind:value={lastName} required />
                </label>
                <label>
                    Email
                    <input type="email" bind:value={email} required autocomplete="email" />
                </label>
            {/if}

            <label>
                Password
                <input type="password" bind:value={password} required autocomplete={mode === 'login' ? 'current-password' : 'new-password'} />
            </label>

            {#if error}
                <p class="error">{error}</p>
            {/if}

            <button type="submit" disabled={submitting}>
                {submitting ? 'Please wait...' : mode === 'login' ? 'Log In' : 'Register'}
            </button>
        </form>
    </div>
{/if}

<style>
    .loading {
        text-align: center;
        padding: 4rem;
        color: var(--color-text-muted);
    }

    .loading-text {
        text-align: center;
        color: var(--color-text-muted);
    }

    /* --- Lobby --- */
    .lobby {
        max-width: 1000px;
        margin: 0 auto;
        padding: 1.5rem;
    }

    .lobby-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1.5rem;
    }

    .lobby-header h1 {
        margin: 0;
        font-size: 1.5rem;
    }

    .lobby-body {
        display: flex;
        gap: 1.5rem;
        align-items: flex-start;
    }

    .game-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
        flex: 1;
        min-width: 0;
    }

    .game-row {
        display: grid;
        grid-template-columns: 1fr auto auto auto;
        align-items: center;
        gap: 1.5rem;
        padding: 10px 16px;
        border-radius: 6px;
        border: 1px solid var(--color-border-light);
    }

    .game-row.my-game {
        border-left: 3px solid #d4a040;
        background: rgba(212, 160, 64, 0.06);
    }

    .game-row.joinable-game {
        border-left: 3px solid #4a90d9;
        background: rgba(74, 144, 217, 0.06);
    }

    .game-row.other-game {
        border-left: 3px solid #6b7280;
        background: rgba(107, 114, 128, 0.04);
    }

    .game-row.selected {
        outline: 2px solid var(--color-accent, #d4a040);
        outline-offset: -2px;
        background: rgba(212, 160, 64, 0.12);
    }

    .game-name {
        font-weight: 600;
        cursor: pointer;
        user-select: none;
    }

    .game-name:hover {
        text-decoration: underline;
        color: var(--color-accent);
    }

    .game-players, .game-creator {
        font-size: 0.85rem;
        color: var(--color-text-muted);
        white-space: nowrap;
    }

    .badge {
        font-size: 0.75rem;
        padding: 2px 8px;
        border-radius: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        white-space: nowrap;
    }

    .badge-open { background: #2d4a1e; color: #86d95a; }
    .badge-active { background: #1e3a4a; color: #5ab8d9; }
    .badge-completed { background: #3a3a3a; color: #aaa; }
    .badge-map_generated { background: #1e3a4a; color: #5ab8d9; }

    .game-actions {
        flex-shrink: 0;
        text-align: right;
    }

    .waiting-text {
        font-size: 0.85rem;
        color: var(--color-text-muted);
        font-style: italic;
    }

    .empty-text {
        text-align: center;
        color: var(--color-text-muted);
        padding: 2rem;
    }

    /* --- Detail Panel --- */
    .detail-panel {
        width: 220px;
        flex-shrink: 0;
        background: var(--color-bg-panel, #1e1e2e);
        border: 1px solid var(--color-border-light);
        border-radius: 8px;
        padding: 1rem 1.25rem;
    }

    .detail-panel h3 {
        margin: 0 0 0.25rem;
        font-size: 1rem;
    }

    .detail-panel h4 {
        margin: 0.75rem 0 0.25rem;
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--color-text-muted);
    }

    .detail-meta {
        font-size: 0.85rem;
        color: var(--color-text-muted);
        margin: 0;
    }

    .player-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .player-list li {
        font-size: 0.9rem;
    }

    .player-index {
        color: var(--color-text-muted);
        margin-right: 4px;
    }

    .detail-loading {
        font-size: 0.85rem;
        color: var(--color-text-muted);
        margin: 0;
    }

    /* --- Buttons --- */
    .btn {
        padding: 6px 16px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.85rem;
        font-weight: 600;
    }

    .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .btn-create { background: #d4a040; color: #1a1a2e; }
    .btn-create:hover:not(:disabled) { background: #e0b050; }

    .btn-join { background: #4a90d9; color: white; }
    .btn-join:hover { background: #5aa0e9; }

    .btn-enter { background: #5ab8d9; color: #1a1a2e; text-decoration: none; padding: 6px 16px; border-radius: 4px; font-weight: 600; font-size: 0.85rem; }
    .btn-enter:hover { background: #6ac8e9; }

    .btn-view { color: var(--color-text-muted); text-decoration: none; font-size: 0.85rem; }
    .btn-view:hover { color: var(--color-text); }

    .btn-spectate { background: transparent; color: var(--color-text-muted); border: 1px solid var(--color-border-light); text-decoration: none; padding: 6px 16px; border-radius: 4px; font-size: 0.85rem; font-weight: 600; }
    .btn-spectate:hover { color: var(--color-text); border-color: var(--color-text); }

    .btn-express { background: #e07040; color: white; }
    .btn-express:hover:not(:disabled) { background: #f08050; }

    .btn-cancel { background: transparent; color: var(--color-text-muted); border: 1px solid var(--color-border-light); }
    .btn-cancel:hover { color: var(--color-text); border-color: var(--color-text); }

    /* --- Modal --- */
    .modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 100;
    }

    .modal {
        background: var(--color-bg-panel, #1e1e2e);
        border: 1px solid var(--color-border-light);
        border-radius: 8px;
        padding: 1.5rem;
        width: 360px;
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .modal h2 {
        margin: 0;
        font-size: 1.2rem;
    }

    .modal label {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: 0.85rem;
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .modal input,
    .modal select {
        padding: 8px 10px;
        background: var(--color-bg, #12121e);
        border: 1px solid var(--color-border-light);
        border-radius: 4px;
        color: var(--color-text);
        font-size: 1rem;
        text-transform: none;
        letter-spacing: normal;
    }

    .modal input:focus,
    .modal select:focus {
        outline: none;
        border-color: var(--color-accent);
    }

    .modal-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
    }

    /* --- Auth --- */
    .auth-container {
        max-width: 360px;
        margin: 2rem auto;
    }

    h1 {
        text-align: center;
        font-family: var(--font-display);
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 4px;
        background: var(--gradient-cta);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
    }

    .mode-toggle {
        display: flex;
        gap: 0;
        margin-bottom: 1.5rem;
        border: 1px solid var(--color-border);
        border-radius: 15px;
        overflow: hidden;
    }

    .mode-toggle button {
        flex: 1;
        padding: 8px;
        background: transparent;
        color: var(--color-text-muted);
        border: none;
        cursor: pointer;
        font-family: var(--font-ui);
        font-size: 0.95rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .mode-toggle button.active {
        background: var(--gradient-cta);
        color: #0f0f23;
    }

    form {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .auth-container label {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-family: var(--font-ui);
        font-size: 0.9rem;
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.06em;
    }

    .auth-container input {
        padding: 10px 12px;
        background: rgba(139, 92, 246, 0.05);
        border: 2px solid rgba(139, 92, 246, 0.30);
        border-radius: 12px;
        color: var(--color-text);
        font-size: 1rem;
        text-transform: none;
        letter-spacing: normal;
    }

    .auth-container input:focus {
        outline: none;
        border-color: var(--color-accent-violet);
    }

    form button[type="submit"] {
        padding: 12px;
        background: var(--gradient-cta);
        color: #0f0f23;
        border: none;
        border-radius: 50px;
        cursor: pointer;
        font-family: var(--font-ui);
        font-size: 1rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 2px;
        margin-top: 0.5rem;
    }

    form button[type="submit"]:hover {
        filter: brightness(1.1);
    }

    form button[type="submit"]:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .error {
        color: var(--color-error, #e74c3c);
        margin: 0;
        font-size: 0.9rem;
    }
</style>
