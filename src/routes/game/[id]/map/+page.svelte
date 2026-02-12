<script>
    import GameMap from '$lib/components/GameMap.svelte';

    let { data } = $props();
    let { gameId, mapData, error } = data;

    let selectedSystem = $state(null);

    function handleSelectSystem(system) {
        selectedSystem = system;
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
                onSelectSystem={handleSelectSystem}
            />

            {#if selectedSystem}
                <aside class="info-panel">
                    <h2>{selectedSystem.name}</h2>
                    <dl>
                        <dt>Mining Value</dt>
                        <dd>{selectedSystem.mining_value}</dd>
                        <dt>Cluster</dt>
                        <dd>{selectedSystem.cluster_id === -1 ? 'Center' : selectedSystem.cluster_id}</dd>
                        {#if selectedSystem.is_founders_world}
                            <dt>Type</dt>
                            <dd>Founder's World</dd>
                        {:else if selectedSystem.is_home_system}
                            <dt>Type</dt>
                            <dd>Home System</dd>
                            <dt>Owner</dt>
                            <dd>Player {selectedSystem.owner_player_index + 1}</dd>
                        {/if}
                    </dl>
                </aside>
            {/if}
        </div>

        <p class="stats">
            {mapData.systems.length} systems | {mapData.jump_lines.length} jump lines | Seed: {mapData.seed}
        </p>
    {:else}
        <p>Loading...</p>
    {/if}
</div>

<style>
    .map-page {
        padding: 1rem 0;
    }

    h1 {
        color: #eee;
        margin-bottom: 1rem;
    }

    .error {
        color: red;
    }

    .map-layout {
        display: flex;
        gap: 1rem;
        align-items: flex-start;
    }

    .info-panel {
        background: #1a1a2e;
        border: 1px solid #333;
        border-radius: 8px;
        padding: 1rem;
        min-width: 200px;
        color: #eee;
    }

    .info-panel h2 {
        margin: 0 0 0.5rem;
        font-size: 1.1rem;
        color: #f1c40f;
    }

    .info-panel dl {
        margin: 0;
    }

    .info-panel dt {
        color: #888;
        font-size: 0.85rem;
        margin-top: 0.5rem;
    }

    .info-panel dd {
        margin: 0;
        font-size: 1rem;
    }

    .stats {
        color: #666;
        font-size: 0.85rem;
        margin-top: 0.5rem;
    }
</style>
