<script>
    import GameMap from '$lib/components/GameMap.svelte';
    import OrdersPanel from '$lib/components/OrdersPanel.svelte';
    import { getUser } from '$lib/auth.svelte.js';
    import {
        getOrders, isOrdersLoading, isSubmitted,
        loadOrders, loadTurnStatus, createOrder, cancelOrder, submitTurn, resetOrderState,
    } from '$lib/orders.svelte.js';

    let { data } = $props();
    let { gameId, mapData, error } = data;

    let selectedSystem = $state(null);
    let moveSourceSystem = $state(null);
    let interactionMode = $state('select'); // 'select' | 'move_target'
    let orderError = $state(null);
    let hoveredOrderId = $state(null);
    let turnStatuses = $state([]);

    // Current player info
    let currentPlayer = $derived(
        mapData?.players?.find(p => p.username === getUser()?.username) ?? null
    );
    let currentPlayerIndex = $derived(currentPlayer?.player_index ?? null);

    // Build player lookup by player_index
    let playerLookup = $derived(
        mapData?.players
            ? Object.fromEntries(mapData.players.map(p => [p.player_index, p]))
            : {}
    );

    // Build system lookup
    let systemLookup = $derived(
        mapData?.systems
            ? Object.fromEntries(mapData.systems.map(s => [s.system_id, s]))
            : {}
    );

    // Build adjacency from jump lines
    let adjacency = $derived.by(() => {
        const adj = {};
        for (const jl of (mapData?.jump_lines ?? [])) {
            if (!adj[jl.from_system_id]) adj[jl.from_system_id] = new Set();
            if (!adj[jl.to_system_id]) adj[jl.to_system_id] = new Set();
            adj[jl.from_system_id].add(jl.to_system_id);
            adj[jl.to_system_id].add(jl.from_system_id);
        }
        return adj;
    });

    // Valid move targets when in move_target mode
    let validMoveTargets = $derived.by(() => {
        if (interactionMode !== 'move_target' || !moveSourceSystem) return new Set();
        const adj = adjacency[moveSourceSystem.system_id];
        return adj ?? new Set();
    });

    // Ships the current player has at the selected system
    let myShipsAtSelected = $derived.by(() => {
        if (!selectedSystem || currentPlayerIndex == null) return 0;
        const ships = mapData?.ships ?? [];
        const entry = ships.find(
            s => s.system_id === selectedSystem.system_id && s.player_index === currentPlayerIndex
        );
        return entry?.count ?? 0;
    });

    // Structures at selected system
    let structsAtSelected = $derived.by(() => {
        if (!selectedSystem) return [];
        return (mapData?.structures ?? []).filter(s => s.system_id === selectedSystem.system_id);
    });

    let myMineAtSelected = $derived(
        structsAtSelected.some(s => s.structure_type === 'mine' && s.player_index === currentPlayerIndex)
    );
    let myYardAtSelected = $derived(
        structsAtSelected.some(s => s.structure_type === 'shipyard' && s.player_index === currentPlayerIndex)
    );

    // Check if current player owns or has presence in the selected system
    let isMySystem = $derived(
        selectedSystem?.owner_player_index === currentPlayerIndex
    );

    // Turn ID
    let turnId = $derived(mapData?.current_turn ?? 1);

    // Load orders and turn status on mount
    $effect(() => {
        if (gameId && turnId) {
            resetOrderState();
            loadOrders(gameId, turnId);
            loadTurnStatus(gameId, turnId).then(statuses => {
                turnStatuses = statuses;
            });
        }
    });

    function ownerName(system) {
        if (system.owner_player_index == null) return null;
        const p = playerLookup[system.owner_player_index];
        return p ? p.username : `Player ${system.owner_player_index}`;
    }

    function handleSelectSystem(system) {
        if (interactionMode === 'move_target' && moveSourceSystem) {
            // Clicked a system while choosing move target
            if (validMoveTargets.has(system.system_id)) {
                promptMoveShips(system);
            }
            return;
        }
        selectedSystem = system;
        interactionMode = 'select';
        moveSourceSystem = null;
    }

    function startMoveMode() {
        if (!selectedSystem || myShipsAtSelected <= 0) return;
        moveSourceSystem = selectedSystem;
        interactionMode = 'move_target';
    }

    function cancelMoveMode() {
        interactionMode = 'select';
        moveSourceSystem = null;
    }

    async function promptMoveShips(targetSystem) {
        // For simplicity, move all ships. Could add a count prompt later.
        const count = myShipsAtSelected;
        if (count <= 0) return;

        orderError = null;
        try {
            await createOrder(gameId, turnId, {
                order_type: 'move_ships',
                source_system_id: moveSourceSystem.system_id,
                target_system_id: targetSystem.system_id,
                ship_count: count,
            });
        } catch (e) {
            orderError = e.message;
        }
        interactionMode = 'select';
        moveSourceSystem = null;
    }

    async function handleBuildMine() {
        if (!selectedSystem) return;
        orderError = null;
        try {
            await createOrder(gameId, turnId, {
                order_type: 'build_mine',
                source_system_id: selectedSystem.system_id,
            });
        } catch (e) {
            orderError = e.message;
        }
    }

    async function handleBuildShipyard() {
        if (!selectedSystem) return;
        orderError = null;
        try {
            await createOrder(gameId, turnId, {
                order_type: 'build_shipyard',
                source_system_id: selectedSystem.system_id,
            });
        } catch (e) {
            orderError = e.message;
        }
    }

    async function handleBuildShips() {
        if (!selectedSystem) return;
        orderError = null;
        try {
            await createOrder(gameId, turnId, {
                order_type: 'build_ships',
                source_system_id: selectedSystem.system_id,
                ship_count: 1,
            });
        } catch (e) {
            orderError = e.message;
        }
    }

    async function handleCancelOrder(orderId) {
        orderError = null;
        try {
            await cancelOrder(gameId, turnId, orderId);
        } catch (e) {
            orderError = e.message;
        }
    }

    async function handleSubmitTurn() {
        orderError = null;
        try {
            await submitTurn(gameId, turnId);
        } catch (e) {
            orderError = e.message;
        }
    }

    // Check if player has submitted
    function hasSubmitted(playerIndex) {
        const status = turnStatuses.find(s => s.player_index === playerIndex);
        return status?.has_submitted ?? false;
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
                orders={getOrders()}
                {moveSourceSystem}
                {validMoveTargets}
                {hoveredOrderId}
                {currentPlayerIndex}
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
                            {#if hasSubmitted(player.player_index)}
                                <span class="submitted-check" title="Submitted">✓</span>
                            {/if}
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

                        {#if !isSubmitted() && isMySystem && interactionMode === 'select'}
                            <div class="build-actions">
                                {#if myShipsAtSelected > 0}
                                    <button class="action-btn move-btn" onclick={startMoveMode}>
                                        Move {myShipsAtSelected} Ship{myShipsAtSelected !== 1 ? 's' : ''}
                                    </button>
                                {/if}
                                {#if !myMineAtSelected}
                                    <button class="action-btn" onclick={handleBuildMine}>Build Mine</button>
                                {/if}
                                {#if !myYardAtSelected}
                                    <button class="action-btn" onclick={handleBuildShipyard}>Build Shipyard</button>
                                {/if}
                                {#if myYardAtSelected}
                                    <button class="action-btn" onclick={handleBuildShips}>Build Ships</button>
                                {/if}
                            </div>
                        {/if}

                        {#if interactionMode === 'move_target'}
                            <div class="move-prompt">
                                <p>Select a destination system</p>
                                <button class="action-btn cancel-move" onclick={cancelMoveMode}>Cancel Move</button>
                            </div>
                        {/if}
                    </div>
                {/if}

                <OrdersPanel
                    orders={getOrders()}
                    {systemLookup}
                    playerColor={currentPlayer?.color ?? '#888'}
                    submitted={isSubmitted()}
                    onCancel={handleCancelOrder}
                    onSubmit={handleSubmitTurn}
                    bind:hoveredOrderId
                    {orderError}
                />
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
        min-width: 220px;
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

    .submitted-check {
        color: #2ecc71;
        font-weight: bold;
        font-size: 1rem;
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

    .build-actions {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        margin-top: 0.75rem;
        padding-top: 0.75rem;
        border-top: 1px solid var(--color-border);
    }

    .action-btn {
        background: var(--color-bg-panel-hover);
        border: 1px solid var(--color-border-light);
        border-radius: 4px;
        color: var(--color-text);
        padding: 0.35rem 0.6rem;
        cursor: pointer;
        font-size: 0.85rem;
        text-align: left;
    }

    .action-btn:hover {
        background: var(--color-border);
    }

    .move-btn {
        color: var(--color-accent);
        border-color: var(--color-accent);
    }

    .move-prompt {
        margin-top: 0.75rem;
        padding-top: 0.75rem;
        border-top: 1px solid var(--color-border);
    }

    .move-prompt p {
        margin: 0 0 0.5rem;
        color: var(--color-accent);
        font-size: 0.9rem;
    }

    .cancel-move {
        color: var(--color-error);
        border-color: var(--color-error);
    }
</style>
