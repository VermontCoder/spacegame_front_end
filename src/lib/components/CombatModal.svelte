<script>
    let { system, logs, players, turnId, onClose } = $props();

    // Group combatants by round_number from the log entries
    // Each log entry has: system_id, round_number, description, combatants[]
    const rounds = $derived.by(() => {
        const map = new Map();
        for (const log of logs) {
            if (!map.has(log.round_number)) {
                map.set(log.round_number, { description: log.description, combatants: [] });
            }
            const entry = map.get(log.round_number);
            for (const c of log.combatants) {
                entry.combatants.push(c);
            }
        }
        return [...map.entries()].sort((a, b) => a[0] - b[0]);
    });

    function getPlayerColor(playerIndex) {
        const player = players?.find(p => p.player_index === playerIndex);
        return player?.color || '#888';
    }

    function getPlayerName(playerIndex) {
        if (playerIndex === -1) return "Founder's World";
        const player = players?.find(p => p.player_index === playerIndex);
        return player?.username || `Player ${playerIndex}`;
    }

    // Get final round survivors
    const maxRound = $derived(Math.max(...logs.map(l => l.round_number)));
    const finalRoundCombatants = $derived.by(() => {
        const finalLogs = logs.filter(l => l.round_number === maxRound);
        const combatants = [];
        for (const log of finalLogs) {
            for (const c of log.combatants) {
                combatants.push(c);
            }
        }
        return combatants;
    });
    const survivors = $derived(finalRoundCombatants.filter(c => c.ships_after > 0));

    function handleBackdropClick(e) {
        if (e.target === e.currentTarget) onClose();
    }

    function handleKeydown(e) {
        if (e.key === 'Escape') onClose();
    }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="combat-backdrop" onclick={handleBackdropClick}>
    <div class="combat-modal">
        <button class="close-btn" onclick={onClose}>&times;</button>
        <h2 class="modal-title">Combat at {system?.name ?? 'Unknown'} — Turn {turnId}</h2>

        {#each rounds as [roundNum, roundData]}
            <div class="round-section">
                <h3 class="round-heading">Round {roundNum}</h3>
                <table class="combat-table">
                    <thead>
                        <tr>
                            <th>Player</th>
                            <th>Ships Before</th>
                            <th>Hits Scored</th>
                            <th>Ships After</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each roundData.combatants as c}
                            <tr>
                                <td>
                                    <span class="player-dot" style="background: {getPlayerColor(c.player_index)};"></span>
                                    <span style="color: {getPlayerColor(c.player_index)};">{getPlayerName(c.player_index)}</span>
                                </td>
                                <td class="num">{c.ships_before}</td>
                                <td class="num">{c.hits_scored}</td>
                                <td class="num" class:destroyed={c.ships_after === 0}>{c.ships_after}</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        {/each}

        <div class="result-section">
            <h3 class="result-heading">Result</h3>
            {#if survivors.length === 0}
                <p class="result-text">All forces destroyed.</p>
            {:else}
                {#each survivors as s}
                    <p class="result-text">
                        <span class="player-dot" style="background: {getPlayerColor(s.player_index)};"></span>
                        <span style="color: {getPlayerColor(s.player_index)}; font-weight: bold;">{getPlayerName(s.player_index)}</span>
                        — {s.ships_after} ship{s.ships_after !== 1 ? 's' : ''} remaining
                    </p>
                {/each}
            {/if}
        </div>
    </div>
</div>

<style>
    .combat-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 100;
    }

    .combat-modal {
        position: relative;
        background: #1a1a2e;
        border: 1px solid rgba(139, 92, 246, 0.40);
        border-radius: 20px;
        padding: 1.5rem 2rem;
        min-width: 400px;
        max-width: 550px;
        max-height: 80vh;
        overflow-y: auto;
        color: var(--color-text);
    }

    .close-btn {
        position: absolute;
        top: 8px;
        right: 12px;
        background: none;
        border: none;
        color: var(--color-text-muted);
        font-size: 1.5rem;
        cursor: pointer;
        line-height: 1;
    }

    .close-btn:hover {
        color: var(--color-accent);
    }

    .modal-title {
        margin: 0 0 1rem;
        font-family: var(--font-display);
        font-size: 1rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 2px;
        color: var(--color-accent);
    }

    .round-section {
        margin-bottom: 1rem;
    }

    .round-heading {
        margin: 0 0 0.4rem;
        font-family: var(--font-ui);
        font-size: 0.85rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--color-text-muted);
        border-bottom: 1px solid var(--color-border);
        padding-bottom: 0.2rem;
    }

    .combat-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.85rem;
    }

    .combat-table th {
        text-align: left;
        padding: 0.3rem 0.5rem;
        color: var(--color-text-muted);
        font-family: var(--font-ui);
        font-weight: 600;
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
    }

    .combat-table td {
        padding: 0.3rem 0.5rem;
    }

    .num {
        text-align: center;
        font-variant-numeric: tabular-nums;
    }

    .destroyed {
        color: #e74c3c;
        font-weight: bold;
    }

    .player-dot {
        display: inline-block;
        width: 10px;
        height: 10px;
        border-radius: 2px;
        margin-right: 5px;
        vertical-align: middle;
        border: 1px solid rgba(255,255,255,0.2);
    }

    .result-section {
        margin-top: 0.5rem;
        padding-top: 0.75rem;
        border-top: 1px solid var(--color-border);
    }

    .result-heading {
        margin: 0 0 0.4rem;
        font-family: var(--font-ui);
        font-size: 0.85rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--color-text-muted);
    }

    .result-text {
        margin: 0.2rem 0;
        font-size: 0.85rem;
    }
</style>
