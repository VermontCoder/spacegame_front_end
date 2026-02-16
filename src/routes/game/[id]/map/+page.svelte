<script>
    import GameMap from '$lib/components/GameMap.svelte';

    let { data } = $props();
    let { gameId, mapData, error } = data;

    let selectedSystem = $state(null);

    function handleSelectSystem(system) {
        selectedSystem = system;
    }

    // Build player lookup by player_index
    let playerLookup = $derived(
        mapData?.players
            ? Object.fromEntries(mapData.players.map(p => [p.player_index, p]))
            : {}
    );

    function ownerName(system) {
        if (system.owner_player_index == null) return null;
        const p = playerLookup[system.owner_player_index];
        return p ? p.username : `Player ${system.owner_player_index}`;
    }
</script>

<div class="map-page">
    <h1>Star Map — {mapData?.game_name ?? `Game ${gameId}`}</h1>

    {#if error}
        <p class="error">{error}</p>
    {:else if mapData}
        <div class="map-layout">
            <GameMap
                systems={mapData.systems}
                jumpLines={mapData.jump_lines}
                ships={mapData.ships ?? []}
                structures={mapData.structures ?? []}
                players={mapData.players ?? []}
                onSelectSystem={handleSelectSystem}
            />

            <aside class="sidebar">
                {#if mapData.current_turn}
                    <div class="turn-indicator">Turn {mapData.current_turn}</div>
                {/if}

                <div class="legend-panel">
                    <h2>Players</h2>
                    {#each mapData.players ?? [] as player}
                        <div class="player-row">
                            <span class="color-swatch" style="background: {player.color};"></span>
                            <span class="player-name">{player.username}</span>
                            {#if player.home_system_name}
                                <span class="home-name">{player.home_system_name}</span>
                            {/if}
                        </div>
                    {/each}
                </div>

                {#if selectedSystem}
                    <div class="selected-panel">
                        <h2>{selectedSystem.name}</h2>
                        <dl>
                            <dt>Mining Value</dt>
                            <dd>{selectedSystem.mining_value}</dd>
                            <dt>Materials</dt>
                            <dd>{selectedSystem.materials ?? 0}</dd>
                            {#if selectedSystem.is_founders_world}
                                <dt>Type</dt>
                                <dd>Founder's World</dd>
                            {:else if selectedSystem.is_home_system}
                                <dt>Type</dt>
                                <dd>Home System</dd>
                                <dt>Owner</dt>
                                <dd>{ownerName(selectedSystem)}</dd>
                            {:else if selectedSystem.owner_player_index != null}
                                <dt>Owner</dt>
                                <dd>{ownerName(selectedSystem)}</dd>
                            {/if}
                        </dl>
                    </div>
                {/if}
            </aside>
        </div>
    {:else}
        <p>Loading...</p>
    {/if}
</div>

<style>
    .map-page {
        padding: 1rem 0;
    }

    h1 {
        margin-bottom: 1rem;
    }

    .error {
        color: var(--color-error);
    }

    .map-layout {
        display: flex;
        gap: 1rem;
        align-items: flex-start;
    }

    .sidebar {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        min-width: 200px;
    }

    .turn-indicator {
        background: var(--color-bg-panel);
        border: 1px solid var(--color-border);
        border-radius: 8px;
        padding: 0.5rem 1rem;
        font-weight: bold;
        text-align: center;
        color: var(--color-accent);
    }

    .legend-panel, .selected-panel {
        background: var(--color-bg-panel);
        border: 1px solid var(--color-border);
        border-radius: 8px;
        padding: 1rem;
    }

    .legend-panel h2, .selected-panel h2 {
        margin: 0 0 0.5rem;
        font-size: 1.1rem;
        color: var(--color-accent);
    }

    .player-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.25rem 0;
    }

    .color-swatch {
        width: 14px;
        height: 14px;
        border-radius: 3px;
        flex-shrink: 0;
        border: 1px solid rgba(255,255,255,0.2);
    }

    .player-name {
        font-weight: 500;
    }

    .home-name {
        color: var(--color-text-dim);
        font-size: 0.8rem;
        margin-left: auto;
    }

    .selected-panel dl {
        margin: 0;
    }

    .selected-panel dt {
        color: var(--color-text-dim);
        font-size: 0.85rem;
        margin-top: 0.5rem;
    }

    .selected-panel dd {
        margin: 0;
        font-size: 1rem;
    }
</style>
