<script>
    import { untrack, onDestroy } from 'svelte';
    import GameMap from '$lib/components/GameMap.svelte';
    import OrdersPanel from '$lib/components/OrdersPanel.svelte';
    import CombatModal from '$lib/components/CombatModal.svelte';
    import { getUser, apiFetch } from '$lib/auth.svelte.js';
    import { holdRepeat } from '$lib/holdRepeat.js';
    import {
        getOrders, isOrdersLoading, isSubmitted,
        loadOrders, loadTurnStatus, createOrder, cancelOrder, submitTurn, resetOrderState, setSubmitted,
        loadSnapshot,
    } from '$lib/orders.svelte.js';

    let { data } = $props();
    let { gameId, mapData, error } = data;

    let selectedSystem = $state(null);
    let moveSourceSystem = $state(null);
    let moveTargetSystem = $state(null);
    let moveQuantity = $state(1);
    let mineTargetSystem = $state(null);
    let mineFunding = $state({}); // system_id → allocated amount
    let buildShipsQty = $state(1);
    let interactionMode = $state('select'); // 'select' | 'move_target' | 'move_count' | 'mine_funding'
    let orderError = $state(null);
    let hoveredOrderId = $state(null);
    let turnStatuses = $state([]);

    // Phase 3: turn resolution state
    let liveMapData = $state(mapData);
    let lastResolvedSnapshot = $state(null);
    let combatSystemId = $state(null);
    let pollingInterval = $state(null);

    // Phase 4: replay state
    let replayMode = $state(false);
    let replayTurnIndex = $state(0);     // 0 = initial state, N = after turn N resolved
    let allResolvedTurns = $state([]);   // [{turn_id, status, resolved_at}, ...]
    let snapshotCache = $state({});      // keyed by turn_id → snapshot data
    let replaySnapshot = $state(null);   // currently displayed snapshot
    let transitShips = $state([]);       // [{playerIndex, count, fromSystemId, toSystemId}]
    let animationActive = $state(false); // true: CSS transform transition fires on transit chits
    let animating = $state(false);       // true while playTurn() is running
    let replayAborted = $state(false);   // set true in exitReplayMode() to abort mid-animation

    const combatSystems = $derived(
        lastResolvedSnapshot
            ? [...new Set(lastResolvedSnapshot.combat_logs.map(l => l.system_id))]
            : []
    );

    // Current player info
    let currentPlayer = $derived(
        liveMapData?.players?.find(p => p.username === getUser()?.username) ?? null
    );
    let currentPlayerIndex = $derived(currentPlayer?.player_index ?? null);

    // Build player lookup by player_index
    let playerLookup = $derived(
        liveMapData?.players
            ? Object.fromEntries(liveMapData.players.map(p => [p.player_index, p]))
            : {}
    );

    // Materials committed by pending build orders, keyed by system_id
    let materialsCommittedOut = $derived.by(() => {
        const out = {};
        for (const order of getOrders()) {
            if (order.order_type === 'build_mine') {
                for (const ms of (order.material_sources ?? [])) {
                    out[ms.system_id] = (out[ms.system_id] ?? 0) + ms.amount;
                }
            } else if (order.order_type === 'build_shipyard') {
                out[order.source_system_id] = (out[order.source_system_id] ?? 0) + 30;
            } else if (order.order_type === 'build_ships') {
                out[order.source_system_id] = (out[order.source_system_id] ?? 0) + order.quantity;
            }
        }
        return out;
    });

    // System materials adjusted for pending build orders (for map display)
    let displaySystems = $derived.by(() => {
        return (liveMapData?.systems ?? []).map(s => {
            const committed = materialsCommittedOut[s.system_id] ?? 0;
            if (committed === 0) return s;
            return { ...s, materials: Math.max(0, s.materials - committed) };
        });
    });

    // Build system lookup (uses display values so funding UI sees correct available materials)
    let systemLookup = $derived(
        Object.fromEntries(displaySystems.map(s => [s.system_id, s]))
    );

    // Build adjacency from jump lines
    let adjacency = $derived.by(() => {
        const adj = {};
        for (const jl of (liveMapData?.jump_lines ?? [])) {
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

    // Ships already committed to move orders this turn, keyed by source system_id
    let shipsCommittedOut = $derived.by(() => {
        const out = {};
        for (const order of getOrders()) {
            if (order.order_type === 'move_ships') {
                const sid = order.source_system_id;
                out[sid] = (out[sid] ?? 0) + order.quantity;
            }
        }
        return out;
    });

    // Available ships for the current player at any system, after committed move orders
    function availableShipsAt(systemId) {
        if (systemId == null || currentPlayerIndex == null) return 0;
        const entry = (liveMapData?.ships ?? []).find(
            s => s.system_id === systemId && s.player_index === currentPlayerIndex
        );
        const total = entry?.count ?? 0;
        const committed = shipsCommittedOut[systemId] ?? 0;
        return Math.max(0, total - committed);
    }

    let availableShipsAtSource = $derived(availableShipsAt(moveSourceSystem?.system_id));

    // Existing move order for the current source→target pair (at most one allowed)
    let existingMoveOrderForTarget = $derived.by(() => {
        if (!moveSourceSystem || !moveTargetSystem) return null;
        return getOrders().find(o =>
            o.order_type === 'move_ships' &&
            o.source_system_id === moveSourceSystem.system_id &&
            o.target_system_id === moveTargetSystem.system_id
        ) ?? null;
    });

    // Max ships movable to target: available + what the existing order already committed
    let maxMoveQuantity = $derived(
        availableShipsAtSource + (existingMoveOrderForTarget?.quantity ?? 0)
    );

    // Ship counts adjusted for pending move/build orders (for map display)
    let displayShips = $derived.by(() => {
        // Build lookup of build_ships orders by system_id for current player
        const buildingBySid = {};
        for (const order of getOrders()) {
            if (order.order_type === 'build_ships') {
                buildingBySid[order.source_system_id] = order.quantity;
            }
        }

        const handledSids = new Set();
        const result = (liveMapData?.ships ?? []).map(s => {
            if (s.player_index !== currentPlayerIndex) return s;
            handledSids.add(s.system_id);
            const committed = shipsCommittedOut[s.system_id] ?? 0;
            const building = buildingBySid[s.system_id] ?? 0;
            const count = Math.max(0, s.count - committed);
            return building > 0 ? { ...s, count, building } : { ...s, count };
        });

        // Add virtual entries for systems where current player has a build order but no ships yet
        for (const [sidStr, qty] of Object.entries(buildingBySid)) {
            const sid = parseInt(sidStr);
            if (!handledSids.has(sid) && currentPlayerIndex != null) {
                result.push({ system_id: sid, player_index: currentPlayerIndex, count: 0, building: qty });
            }
        }

        return result;
    });

    // Auto-exit move_target when all ships at source are committed
    $effect(() => {
        if (interactionMode === 'move_target' && moveSourceSystem && availableShipsAtSource <= 0) {
            cancelMoveMode();
        }
    });

    // Mine funding
    let mineFundingTotal = $derived(Object.values(mineFunding).reduce((s, v) => s + v, 0));
    let eligibleFundingSystems = $derived.by(() => {
        if (interactionMode !== 'mine_funding' || !mineTargetSystem) return [];
        return displaySystems
            .filter(s =>
                s.system_id !== mineTargetSystem.system_id
                && s.owner_player_index === currentPlayerIndex
                && s.materials > 0
            )
            .sort((a, b) => b.materials - a.materials);
    });

    // Ships the current player has at the selected system, minus any already ordered out
    let myShipsAtSelected = $derived(availableShipsAt(selectedSystem?.system_id));

    // Materials available at the selected system for building ships (after committed orders)
    let availableMaterialsAtSelected = $derived.by(() => {
        if (!selectedSystem) return 0;
        return systemLookup[selectedSystem.system_id]?.materials ?? 0;
    });

    // Existing build_ships order for the selected system (at most one allowed)
    let buildShipsOrderAtSelected = $derived.by(() => {
        if (!selectedSystem) return null;
        return getOrders().find(o =>
            o.order_type === 'build_ships' &&
            o.source_system_id === selectedSystem.system_id
        ) ?? null;
    });

    // Max ships buildable: available materials + what's already committed in the existing order
    // (since the existing order's cost is already deducted from availableMaterialsAtSelected)
    let maxBuildShips = $derived(
        availableMaterialsAtSelected + (buildShipsOrderAtSelected?.quantity ?? 0)
    );

    // When selected system changes, seed the counter from any existing build_ships order.
    // Reading selectedSystem here (without untrack) makes this effect re-run on selection change.
    $effect(() => {
        void selectedSystem;
        buildShipsQty = untrack(() =>
            getOrders().find(o =>
                o.order_type === 'build_ships' &&
                o.source_system_id === selectedSystem?.system_id
            )?.quantity ?? 1
        );
    });

    // Structures at selected system
    let structsAtSelected = $derived.by(() => {
        if (!selectedSystem) return [];
        return (liveMapData?.structures ?? []).filter(s => s.system_id === selectedSystem.system_id);
    });

    let myMineAtSelected = $derived(
        structsAtSelected.some(s => s.structure_type === 'mine' && s.player_index === currentPlayerIndex)
    );
    let myYardAtSelected = $derived(
        structsAtSelected.some(s => s.structure_type === 'shipyard' && s.player_index === currentPlayerIndex)
    );

    // Pending build orders for the selected system
    let mineOrderAtSelected = $derived(
        selectedSystem != null && getOrders().some(o =>
            o.order_type === 'build_mine' && o.source_system_id === selectedSystem.system_id
        )
    );
    let yardOrderAtSelected = $derived(
        selectedSystem != null && getOrders().some(o =>
            o.order_type === 'build_shipyard' && o.source_system_id === selectedSystem.system_id
        )
    );

    // Check if current player owns or has presence in the selected system
    let isMySystem = $derived(
        selectedSystem?.owner_player_index === currentPlayerIndex
    );

    // Turn ID
    let turnId = $derived(liveMapData?.current_turn ?? 1);

    // Express game
    let isExpress = $derived(liveMapData?.is_express ?? false);
    let expressEndError = $state(null);

    async function handleExpressEnd() {
        expressEndError = null;
        try {
            const res = await apiFetch(`/games/${gameId}`, { method: 'DELETE' });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail ?? 'Failed to delete game');
            }
            window.location.href = '/';
        } catch (e) {
            expressEndError = e.message;
        }
    }

    // Victory
    let isCompleted = $derived(liveMapData?.status === 'completed');
    let winnerPlayer = $derived(
        liveMapData?.winner_player_index != null
            ? (liveMapData?.players ?? []).find(p => p.player_index === liveMapData.winner_player_index) ?? null
            : null
    );
    let isMyVictory = $derived(winnerPlayer?.username === getUser()?.username);

    // Replay: use snapshot data for map display; live: use the existing derived values
    let maxResolvedTurnId = $derived(
        allResolvedTurns.length > 0 ? allResolvedTurns[allResolvedTurns.length - 1].turn_id : 0
    );

    let mapSystems = $derived(
        replayMode && replaySnapshot ? replaySnapshot.systems : displaySystems
    );
    let mapShips = $derived(
        replayMode && replaySnapshot ? replaySnapshot.ships : displayShips
    );
    let mapStructures = $derived(
        replayMode && replaySnapshot ? replaySnapshot.structures : (liveMapData?.structures ?? [])
    );
    let mapOrders = $derived(
        replayMode && replaySnapshot ? replaySnapshot.orders : getOrders()
    );
    let mapCombatSystems = $derived(
        replayMode && replaySnapshot
            ? [...new Set(replaySnapshot.combat_logs.map(l => l.system_id))]
            : combatSystems
    );
    let activeCombatSnapshot = $derived(
        replayMode && replaySnapshot ? replaySnapshot : lastResolvedSnapshot
    );

    // Load orders and turn status once auth is ready
    let currentUser = $derived(getUser());
    $effect(() => {
        if (gameId && turnId && currentUser) {
            resetOrderState();
            loadOrders(gameId, turnId);
            loadTurnStatus(gameId, turnId).then(statuses => {
                turnStatuses = statuses;
                // If this player already submitted, restore submitted state
                if (currentPlayerIndex != null) {
                    const myStatus = statuses.find(s => s.player_index === currentPlayerIndex);
                    if (myStatus?.submitted) {
                        setSubmitted(true);
                    }
                }
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
            if (validMoveTargets.has(system.system_id)) {
                startMoveCount(system);
            }
            return;
        }
        if (interactionMode === 'move_count' || interactionMode === 'mine_funding') {
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
        moveTargetSystem = null;
        moveQuantity = 1;
    }

    function startMoveCount(targetSystem) {
        moveTargetSystem = targetSystem;
        // Seed from existing order if one exists, otherwise default to all available
        const existing = getOrders().find(o =>
            o.order_type === 'move_ships' &&
            o.source_system_id === moveSourceSystem?.system_id &&
            o.target_system_id === targetSystem.system_id
        );
        moveQuantity = existing?.quantity ?? availableShipsAtSource;
        interactionMode = 'move_count';
    }

    function adjustMoveQuantity(delta) {
        moveQuantity = Math.max(1, Math.min(moveQuantity + delta, maxMoveQuantity));
    }

    async function confirmMove() {
        if (!moveSourceSystem || !moveTargetSystem || moveQuantity <= 0) return;
        orderError = null;
        try {
            // Replace any existing order for this source→target pair
            const existing = untrack(() => existingMoveOrderForTarget);
            if (existing) {
                await cancelOrder(gameId, turnId, existing.order_id);
            }
            await createOrder(gameId, turnId, {
                order_type: 'move_ships',
                source_system_id: moveSourceSystem.system_id,
                target_system_id: moveTargetSystem.system_id,
                quantity: moveQuantity,
            });
            // Return to target selection — auto-exit effect will cancel if no ships remain
            moveTargetSystem = null;
            moveQuantity = 1;
            interactionMode = 'move_target';
        } catch (e) {
            orderError = e.message;
        }
    }

    function startMineFunding() {
        if (!selectedSystem || isSubmitted()) return;
        mineTargetSystem = selectedSystem;
        mineFunding = {};
        interactionMode = 'mine_funding';
    }

    function cancelMineFunding() {
        mineTargetSystem = null;
        mineFunding = {};
        interactionMode = 'select';
    }

    function adjustFunding(systemId, delta) {
        const current = mineFunding[systemId] ?? 0;
        const sys = systemLookup[systemId];
        const available = sys?.materials ?? 0;
        if (delta > 0) {
            const remaining = 15 - mineFundingTotal;
            const maxAdd = Math.min(remaining, available - current);
            if (maxAdd <= 0) return;
            mineFunding = { ...mineFunding, [systemId]: current + 1 };
        } else {
            if (current <= 0) return;
            mineFunding = { ...mineFunding, [systemId]: current - 1 };
        }
    }

    async function issueMineBuild() {
        if (!mineTargetSystem || mineFundingTotal !== 15) return;
        orderError = null;
        const sources = Object.entries(mineFunding)
            .filter(([, amt]) => amt > 0)
            .map(([sid, amt]) => ({ system_id: parseInt(sid), amount: amt }));
        try {
            await createOrder(gameId, turnId, {
                order_type: 'build_mine',
                source_system_id: mineTargetSystem.system_id,
                material_sources: sources,
            });
            cancelMineFunding();
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
        if (!selectedSystem || buildShipsQty < 1) return;
        orderError = null;
        try {
            // Replace any existing build_ships order for this system
            const existing = untrack(() => buildShipsOrderAtSelected);
            if (existing) {
                await cancelOrder(gameId, turnId, existing.order_id);
            }
            await createOrder(gameId, turnId, {
                order_type: 'build_ships',
                source_system_id: selectedSystem.system_id,
                quantity: buildShipsQty,
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
            const result = await submitTurn(gameId, turnId);
            if (result?.turn_resolved) {
                await refreshAfterResolution();
            } else {
                // Refresh turn statuses to show checkmark
                turnStatuses = await loadTurnStatus(gameId, turnId);
                startPolling();
            }
        } catch (e) {
            orderError = e.message;
        }
    }

    async function refreshAfterResolution() {
        const resolvedTurnId = turnId;
        // Fetch updated map data
        const res = await apiFetch(`/games/${gameId}/map`);
        if (res.ok) {
            liveMapData = await res.json();
        }
        // Load snapshot of the turn that just resolved (for combat data)
        const snap = await loadSnapshot(gameId, resolvedTurnId);
        lastResolvedSnapshot = snap;
        // Reset orders for the new turn
        resetOrderState();
        selectedSystem = null;
        interactionMode = 'select';
        // Refresh turn statuses for the new turn
        turnStatuses = await loadTurnStatus(gameId, liveMapData?.current_turn ?? 1);
        stopPolling();
    }

    function startPolling() {
        if (pollingInterval) return;
        pollingInterval = setInterval(async () => {
            const res = await apiFetch(`/games/${gameId}/map`);
            if (!res.ok) return;
            const data = await res.json();
            if (data.current_turn !== turnId) {
                // Turn advanced — resolution happened
                const resolvedTurnId = turnId;
                liveMapData = data;
                const snap = await loadSnapshot(gameId, resolvedTurnId);
                lastResolvedSnapshot = snap;
                resetOrderState();
                selectedSystem = null;
                interactionMode = 'select';
                turnStatuses = await loadTurnStatus(gameId, data.current_turn);
                stopPolling();
            }
        }, 5000);
    }

    function stopPolling() {
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }
    }

    async function fetchAllResolvedTurns(gid) {
        const res = await apiFetch(`/games/${gid}/turns`);
        if (!res.ok) return [];
        const turns = await res.json();
        return turns
            .filter(t => t.status === 'resolved')
            .sort((a, b) => a.turn_id - b.turn_id);
    }

    async function loadCachedSnapshot(gid, turnId) {
        if (snapshotCache[turnId]) return snapshotCache[turnId];
        const snap = await loadSnapshot(gid, turnId);
        if (snap) snapshotCache = { ...snapshotCache, [turnId]: snap };
        return snap ?? null;
    }

    async function enterReplayMode() {
        replayAborted = false;
        const turns = await fetchAllResolvedTurns(gameId);
        allResolvedTurns = turns;
        const latestTurnId = turns.length > 0 ? turns[turns.length - 1].turn_id : 0;
        replayTurnIndex = latestTurnId;
        // Pre-load turn 0 (initial) and the latest resolved snapshot
        await loadCachedSnapshot(gameId, 0);
        if (latestTurnId > 0) await loadCachedSnapshot(gameId, latestTurnId);
        replaySnapshot = snapshotCache[latestTurnId] ?? snapshotCache[0] ?? null;
        replayMode = true;
    }

    function exitReplayMode() {
        replayAborted = true;
        replayMode = false;
        replaySnapshot = null;
        transitShips = [];
        animationActive = false;
        animating = false;
        replayTurnIndex = 0;
        allResolvedTurns = [];
        snapshotCache = {};
    }

    onDestroy(() => {
        stopPolling();
    });

    // Check if player has submitted
    function hasSubmitted(playerIndex) {
        const status = turnStatuses.find(s => s.player_index === playerIndex);
        return status?.submitted ?? false;
    }
</script>

<div class="map-page">
    <h1>Star Map — {liveMapData?.game_name ?? `Game ${gameId}`}</h1>

    {#if isCompleted && winnerPlayer}
        <div class="victory-banner" class:my-victory={isMyVictory}>
            <span class="victory-icon">{isMyVictory ? '🏆' : '⚔️'}</span>
            <span class="victory-text">
                {#if isMyVictory}
                    Victory! You captured Founder's World and won the game!
                {:else}
                    <span style="color: {winnerPlayer.color}; font-weight: bold;">{winnerPlayer.username}</span>
                    captured Founder's World — Game Over.
                {/if}
            </span>
        </div>
    {/if}

    {#if error}
        <p class="error">{error}</p>
    {:else if liveMapData}
        <div class="map-layout">
            <GameMap
                systems={mapSystems}
                jumpLines={liveMapData.jump_lines}
                ships={mapShips}
                structures={mapStructures}
                players={liveMapData.players ?? []}
                orders={mapOrders}
                {moveSourceSystem}
                {validMoveTargets}
                {hoveredOrderId}
                {currentPlayerIndex}
                onSelectSystem={handleSelectSystem}
                mineFundingMode={interactionMode === 'mine_funding'}
                mineTargetSystemId={mineTargetSystem?.system_id ?? null}
                {eligibleFundingSystems}
                {mineFunding}
                onAdjustFunding={adjustFunding}
                combatSystems={mapCombatSystems}
                onCombatClick={(sysId) => { combatSystemId = sysId; }}
            />

            <aside class="sidebar">
                {#if liveMapData.current_turn}
                    <div class="turn-indicator">Turn {liveMapData.current_turn}</div>
                {/if}

                {#if !replayMode && (isCompleted || (liveMapData?.current_turn ?? 1) > 1)}
                    <button class="history-btn" onclick={enterReplayMode}>History</button>
                {/if}

                {#if isExpress}
                    <div class="express-end-panel">
                        <button class="express-end-btn" onclick={handleExpressEnd}>
                            Express End
                        </button>
                        {#if expressEndError}
                            <p class="express-end-error">{expressEndError}</p>
                        {/if}
                    </div>
                {/if}

                <div class="legend-panel">
                    <h2>Players</h2>
                    {#each liveMapData.players ?? [] as player}
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

                {#if selectedSystem && !isCompleted && !isSubmitted() && isMySystem && interactionMode === 'select'}
                    <div class="actions-panel">
                        {#if myShipsAtSelected > 0}
                            <button class="action-btn move-btn" onclick={startMoveMode}>
                                Move Ships
                            </button>
                        {/if}
                        {#if !myMineAtSelected && !mineOrderAtSelected}
                            <button class="action-btn" onclick={startMineFunding}>Build Mine</button>
                        {/if}
                        {#if myMineAtSelected && !myYardAtSelected && !yardOrderAtSelected}
                            <button class="action-btn" onclick={handleBuildShipyard}>Build Shipyard</button>
                        {/if}
                        {#if myYardAtSelected}
                            <div class="build-ships-row">
                                <button class="qty-btn" use:holdRepeat={() => buildShipsQty = Math.max(1, buildShipsQty - 1)} disabled={buildShipsQty <= 1}>−</button>
                                <span class="qty-value">{buildShipsQty}</span>
                                <button class="qty-btn" use:holdRepeat={() => buildShipsQty = Math.min(buildShipsQty + 1, maxBuildShips)} disabled={buildShipsQty >= maxBuildShips}>+</button>
                                <button class="action-btn build-ships-btn" onclick={handleBuildShips} disabled={maxBuildShips < 1}>
                                    Build Ship{buildShipsQty !== 1 ? 's' : ''}
                                </button>
                            </div>
                        {/if}
                    </div>
                {/if}

                {#if interactionMode === 'move_target'}
                    <div class="actions-panel move-prompt">
                        <p>Moving from <strong>{moveSourceSystem?.name}</strong></p>
                        <p class="move-remaining">{availableShipsAtSource} ship{availableShipsAtSource !== 1 ? 's' : ''} available — select destination</p>
                        <button class="action-btn cancel-move" onclick={cancelMoveMode}>Done moving from {moveSourceSystem?.name}</button>
                    </div>
                {/if}

                {#if interactionMode === 'move_count'}
                    <div class="actions-panel move-count-panel">
                        <p class="move-count-title">
                            <strong>{moveSourceSystem?.name}</strong> → <strong>{moveTargetSystem?.name}</strong>
                        </p>
                        <div class="move-qty-row">
                            <button class="qty-btn" use:holdRepeat={() => adjustMoveQuantity(-1)} disabled={moveQuantity <= 1}>−</button>
                            <span class="qty-value">{moveQuantity}</span>
                            <button class="qty-btn" use:holdRepeat={() => adjustMoveQuantity(1)} disabled={moveQuantity >= maxMoveQuantity}>+</button>
                            <span class="qty-of">of {maxMoveQuantity}</span>
                        </div>
                        <button class="action-btn confirm-move-btn" onclick={confirmMove}>Confirm Move</button>
                        <button class="action-btn cancel-move" onclick={() => { interactionMode = 'move_target'; moveTargetSystem = null; }}>Back</button>
                    </div>
                {/if}

                {#if interactionMode === 'mine_funding'}
                    <div class="actions-panel mine-funding-panel">
                        <p class="funding-title">Funding Mine at <strong>{mineTargetSystem?.name}</strong></p>
                        <p class="funding-progress" class:ready={mineFundingTotal === 15}>
                            {mineFundingTotal} / 15 materials
                        </p>
                        {#if eligibleFundingSystems.length === 0}
                            <p class="funding-empty">No systems with available materials.</p>
                        {/if}
                        <button
                            class="action-btn issue-mine-btn"
                            onclick={issueMineBuild}
                            disabled={mineFundingTotal !== 15}
                        >Issue Order</button>
                        <button class="action-btn cancel-move" onclick={cancelMineFunding}>Cancel</button>
                    </div>
                {/if}

                {#if !isCompleted}
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
                {/if}
            </aside>
        </div>
    {:else}
        <p>Loading...</p>
    {/if}

    {#if combatSystemId !== null && activeCombatSnapshot}
        {@const combatSystem = liveMapData.systems?.find(s => s.system_id === combatSystemId)}
        {@const combatLogs = activeCombatSnapshot.combat_logs.filter(l => l.system_id === combatSystemId)}
        <CombatModal
            system={combatSystem}
            logs={combatLogs}
            players={liveMapData.players}
            turnId={activeCombatSnapshot.turn_id}
            onClose={() => { combatSystemId = null; }}
        />
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

    .victory-banner {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        background: rgba(52, 73, 94, 0.9);
        border: 2px solid #f39c12;
        border-radius: 8px;
        padding: 0.75rem 1.25rem;
        margin-bottom: 1rem;
        font-size: 1rem;
        color: #e0e0e0;
    }

    .victory-banner.my-victory {
        background: rgba(39, 174, 96, 0.2);
        border-color: #2ecc71;
    }

    .victory-icon {
        font-size: 1.5rem;
        flex-shrink: 0;
    }

    .victory-text {
        line-height: 1.4;
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
        width: 240px;
        flex-shrink: 0;
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

    .legend-panel, .actions-panel {
        background: var(--color-bg-panel);
        border: 1px solid var(--color-border);
        border-radius: 8px;
        padding: 1rem;
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

    .actions-panel {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
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

    .move-remaining {
        margin: 0 0 0.5rem;
        font-size: 0.8rem;
        color: var(--color-text-dim);
    }

    .move-count-title {
        margin: 0 0 0.5rem;
        font-size: 0.85rem;
        color: var(--color-accent);
    }

    .move-qty-row {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        margin-bottom: 0.5rem;
    }

    .qty-btn {
        background: var(--color-bg-panel-hover);
        border: 1px solid var(--color-border-light);
        border-radius: 3px;
        color: var(--color-text);
        font-size: 16px;
        font-weight: bold;
        width: 26px;
        height: 26px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
    }

    .qty-btn:disabled {
        opacity: 0.25;
        cursor: not-allowed;
    }

    .qty-value {
        min-width: 28px;
        text-align: center;
        font-size: 1.1rem;
        font-weight: bold;
        color: var(--color-accent);
    }

    .qty-of {
        font-size: 0.8rem;
        color: var(--color-text-dim);
    }

    .build-ships-row {
        display: flex;
        align-items: center;
        gap: 0.4rem;
    }

    .build-ships-btn {
        flex: 1;
        text-align: center;
    }

    .confirm-move-btn {
        color: var(--color-accent);
        border-color: var(--color-accent);
    }

    .funding-title {
        margin: 0 0 0.3rem;
        font-size: 0.85rem;
    }

    .funding-progress {
        margin: 0 0 0.5rem;
        font-size: 0.95rem;
        font-weight: bold;
        color: var(--color-text-dim);
    }

    .funding-progress.ready {
        color: #2ecc71;
    }

    .funding-empty {
        margin: 0 0 0.5rem;
        font-size: 0.8rem;
        color: var(--color-text-dim);
    }

    .issue-mine-btn {
        color: #2ecc71;
        border-color: #2ecc71;
    }

    .issue-mine-btn:disabled {
        opacity: 0.35;
        cursor: not-allowed;
    }

    .express-end-panel {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
    }

    .express-end-btn {
        width: 100%;
        padding: 0.4rem 0.6rem;
        background: rgba(231, 76, 60, 0.15);
        border: 1px solid var(--color-error);
        border-radius: 4px;
        color: var(--color-error);
        cursor: pointer;
        font-size: 0.85rem;
        font-weight: 600;
    }

    .express-end-btn:hover {
        background: rgba(231, 76, 60, 0.3);
    }

    .express-end-error {
        font-size: 0.8rem;
        color: var(--color-error);
        margin: 0;
    }

    .history-btn {
        background: var(--color-bg-panel);
        border: 1px solid var(--color-border-light);
        border-radius: 4px;
        color: var(--color-text-dim);
        padding: 0.3rem 0.6rem;
        cursor: pointer;
        font-size: 0.8rem;
        width: 100%;
    }
    .history-btn:hover {
        background: var(--color-bg-panel-hover);
    }
</style>
