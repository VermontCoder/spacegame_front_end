<script>
    let {
        systems = [],
        jumpLines = [],
        ships = [],
        structures = [],
        players = [],
        onSelectSystem = () => {},
    } = $props();

    // Build a lookup from system_id to system object for jump line rendering
    let systemLookup = $derived(
        Object.fromEntries(systems.map(s => [s.system_id, s]))
    );

    // Player lookup by player_index
    let playerLookup = $derived(
        Object.fromEntries(players.map(p => [p.player_index, p]))
    );

    // Ships grouped by system_id
    let shipsBySystem = $derived(() => {
        const map = {};
        for (const sh of ships) {
            if (!map[sh.system_id]) map[sh.system_id] = [];
            map[sh.system_id].push(sh);
        }
        return map;
    });

    // Structures grouped by system_id
    let structsBySystem = $derived(() => {
        const map = {};
        for (const st of structures) {
            if (!map[st.system_id]) map[st.system_id] = [];
            map[st.system_id].push(st);
        }
        return map;
    });

    function playerColor(playerIndex) {
        if (playerIndex === -1) return '#888888'; // neutral
        const p = playerLookup[playerIndex];
        return p ? p.color : '#888888';
    }

    function playerName(playerIndex) {
        if (playerIndex === -1) return 'Neutral';
        const p = playerLookup[playerIndex];
        return p ? p.username : `Player ${playerIndex}`;
    }

    function systemColor(system) {
        if (system.is_founders_world) return 'var(--color-accent)';
        if (system.owner_player_index != null) return playerColor(system.owner_player_index);
        return '#ffffff';
    }

    function systemRadius(system) {
        if (system.is_founders_world) return 27;
        if (system.is_home_system) return 21;
        return 15;
    }

    // --- Label placement: pick best position (below/above/left/right) to avoid overlap ---
    const LABEL_FONT_SIZE = 11;
    const CHAR_WIDTH = 6;       // approximate width per character at font-size 11
    const LABEL_HEIGHT = 13;    // approximate line height
    const LABEL_GAP = 4;        // gap between circle edge and label

    // Candidate positions: returns { x, y, anchor } for the text element
    function labelCandidates(sys) {
        const r = systemRadius(sys);
        return [
            { key: 'below', x: sys.x, y: sys.y + r + LABEL_GAP + LABEL_HEIGHT, anchor: 'middle' },
            { key: 'above', x: sys.x, y: sys.y - r - LABEL_GAP, anchor: 'middle' },
            { key: 'right', x: sys.x + r + LABEL_GAP, y: sys.y + 4, anchor: 'start' },
            { key: 'left',  x: sys.x - r - LABEL_GAP, y: sys.y + 4, anchor: 'end' },
        ];
    }

    // Bounding box of a label candidate
    function labelBBox(cand, nameLen) {
        const w = nameLen * CHAR_WIDTH;
        let lx;
        if (cand.anchor === 'middle') lx = cand.x - w / 2;
        else if (cand.anchor === 'start') lx = cand.x;
        else lx = cand.x - w;
        return { x: lx, y: cand.y - LABEL_HEIGHT, w, h: LABEL_HEIGHT };
    }

    // Check overlap between two rectangles
    function rectsOverlap(a, b) {
        return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }

    // Circle-rect overlap check
    function circleRectOverlap(cx, cy, cr, rect) {
        const closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
        const closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
        const dx = cx - closestX;
        const dy = cy - closestY;
        return dx * dx + dy * dy < cr * cr;
    }

    // Compute label placements for all systems
    let labelPlacements = $derived.by(() => {
        if (!systems || systems.length === 0) return {};
        const placements = {};   // system_id -> { x, y, anchor }
        const placedBoxes = [];  // bounding boxes of already-placed labels

        for (const sys of systems) {
            const candidates = labelCandidates(sys);
            let bestCand = candidates[0]; // default: below
            let bestPenalty = Infinity;

            for (const cand of candidates) {
                const bbox = labelBBox(cand, sys.name.length);
                let penalty = 0;

                // Penalize overlap with any system circle
                for (const other of systems) {
                    if (other.system_id === sys.system_id) continue;
                    const or_ = systemRadius(other);
                    if (circleRectOverlap(other.x, other.y, or_ + 2, bbox)) {
                        penalty += 100;
                    }
                }

                // Penalize overlap with already-placed labels
                for (const placed of placedBoxes) {
                    if (rectsOverlap(bbox, placed)) {
                        penalty += 50;
                    }
                }

                if (penalty < bestPenalty) {
                    bestPenalty = penalty;
                    bestCand = cand;
                }
            }

            placements[sys.system_id] = bestCand;
            placedBoxes.push(labelBBox(bestCand, sys.name.length));
        }

        return placements;
    });

    // Hover and selection state
    let hoveredSystem = $state(null);
    let selectedSystem = $state(null);

    function handleClick(system) {
        selectedSystem = system;
        onSelectSystem(system);
    }

    function handleKeyDown(event, system) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleClick(system);
        }
    }

    // Compute initial viewBox from system bounding box
    const PADDING = 60;
    const ASPECT = 1440 / 840; // match the aspect-ratio in CSS

    function computeFitViewBox(sysList) {
        if (!sysList || sysList.length === 0) return { x: 0, y: 0, w: 1000, h: 800 };
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const s of sysList) {
            if (s.x < minX) minX = s.x;
            if (s.y < minY) minY = s.y;
            if (s.x > maxX) maxX = s.x;
            if (s.y > maxY) maxY = s.y;
        }
        let w = maxX - minX + PADDING * 2;
        let h = maxY - minY + PADDING * 2;
        // Enforce aspect ratio — expand the smaller dimension
        if (w / h > ASPECT) {
            h = w / ASPECT;
        } else {
            w = h * ASPECT;
        }
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        return { x: cx - w / 2, y: cy - h / 2, w, h };
    }

    let initialViewBox = $derived(computeFitViewBox(systems));

    // Pan/zoom state
    let viewBox = $state(null);
    // Use initialViewBox until user interacts, then track viewBox independently
    let activeViewBox = $derived(viewBox ?? initialViewBox);

    let isPanning = $state(false);
    let didDrag = $state(false);
    let panStartMouse = $state({ x: 0, y: 0 });
    let panStartViewBox = $state({ x: 0, y: 0 });

    const DRAG_THRESHOLD = 4;
    const MIN_VIEW_W = 100;  // max zoom in
    const MAX_VIEW_W = 5000; // max zoom out

    function handleWheel(event) {
        event.preventDefault();
        const zoomFactor = event.deltaY > 0 ? 1.1 : 0.9;
        const vb = activeViewBox;

        // Clamp zoom
        const newW = vb.w * zoomFactor;
        if (newW < MIN_VIEW_W || newW > MAX_VIEW_W) return;
        const newH = newW / ASPECT;

        const svg = event.currentTarget;
        const rect = svg.getBoundingClientRect();
        const mx = (event.clientX - rect.left) / rect.width;
        const my = (event.clientY - rect.top) / rect.height;

        viewBox = {
            x: vb.x + (vb.w - newW) * mx,
            y: vb.y + (vb.h - newH) * my,
            w: newW,
            h: newH,
        };
    }

    function handlePanStart(event) {
        if (event.button !== 0) return;
        isPanning = true;
        didDrag = false;
        panStartMouse = { x: event.clientX, y: event.clientY };
        panStartViewBox = { x: activeViewBox.x, y: activeViewBox.y };
        event.preventDefault();
    }

    function handlePanMove(event) {
        if (!isPanning) return;
        const dx = event.clientX - panStartMouse.x;
        const dy = event.clientY - panStartMouse.y;
        if (!didDrag && Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) {
            didDrag = true;
        }
        if (didDrag) {
            const svg = event.currentTarget;
            const rect = svg.getBoundingClientRect();
            const vb = activeViewBox;
            const svgDx = dx / rect.width * vb.w;
            const svgDy = dy / rect.height * vb.h;
            viewBox = {
                ...vb,
                x: panStartViewBox.x - svgDx,
                y: panStartViewBox.y - svgDy,
            };
        }
    }

    function handlePanEnd() {
        isPanning = false;
    }

    function resetView() {
        viewBox = null; // resets to initialViewBox via activeViewBox derived
    }

    // Tooltip position
    let tooltipX = $state(0);
    let tooltipY = $state(0);

    function handleMouseEnter(system, event) {
        hoveredSystem = system;
        const svg = event.currentTarget.closest('svg');
        const rect = svg.getBoundingClientRect();
        const vb = activeViewBox;
        const scaleX = rect.width / vb.w;
        const scaleY = rect.height / vb.h;
        tooltipX = (system.x - vb.x) * scaleX;
        tooltipY = (system.y - vb.y) * scaleY;
    }

    function handleMouseLeave() {
        hoveredSystem = null;
    }

    // --- Chit position helpers (viewBox coords → screen px) ---
    // Chit positions around the circle (in viewBox-space offsets from system center)
    // Mine at 8 o'clock, yard at 4 o'clock, ships at 12 o'clock
    const CHIT_SIZE = 14; // viewBox units for mine/yard chit dimensions

    function chitPositions(system) {
        const r = systemRadius(system);
        const offset = r + 2;
        return {
            mine:     { dx: -offset * Math.cos(Math.PI / 6), dy: offset * Math.sin(Math.PI / 6) },   // 8 o'clock
            shipyard: { dx: offset * Math.cos(Math.PI / 6),  dy: offset * Math.sin(Math.PI / 6) },    // 4 o'clock
            ships:    { dx: 0, dy: -offset },                                                          // 12 o'clock
        };
    }

    // Convert viewBox coords to screen pixel coords relative to the map-wrapper
    let svgElement = $state(null);

    function viewBoxToScreen(vbX, vbY) {
        if (!svgElement) return { x: 0, y: 0 };
        const rect = svgElement.getBoundingClientRect();
        const vb = activeViewBox;
        return {
            x: (vbX - vb.x) / vb.w * rect.width,
            y: (vbY - vb.y) / vb.h * rect.height,
        };
    }

    // Chit scale factor (viewBox units → screen px)
    function chitScale() {
        if (!svgElement) return 1;
        const rect = svgElement.getBoundingClientRect();
        return rect.width / activeViewBox.w;
    }

    // Reactive chit data: combine system positions with ship/structure data
    let chitData = $derived.by(() => {
        const shipsMap = shipsBySystem();
        const structsMap = structsBySystem();
        const result = [];

        for (const sys of systems) {
            const sysShips = shipsMap[sys.system_id] || [];
            const sysStructs = structsMap[sys.system_id] || [];
            const positions = chitPositions(sys);

            const mines = sysStructs.filter(s => s.structure_type === 'mine');
            const yards = sysStructs.filter(s => s.structure_type === 'shipyard');

            for (const mine of mines) {
                result.push({
                    type: 'mine',
                    system: sys,
                    playerIndex: mine.player_index,
                    pos: positions.mine,
                });
            }
            for (const yard of yards) {
                result.push({
                    type: 'shipyard',
                    system: sys,
                    playerIndex: yard.player_index,
                    pos: positions.shipyard,
                });
            }
            for (const ship of sysShips) {
                if (ship.count > 0) {
                    result.push({
                        type: 'ships',
                        system: sys,
                        playerIndex: ship.player_index,
                        count: ship.count,
                        pos: positions.ships,
                    });
                }
            }
        }
        return result;
    });

    // Force re-render chits on viewBox change
    let chitVersion = $derived(
        activeViewBox ? `${activeViewBox.x}-${activeViewBox.y}-${activeViewBox.w}` : '0'
    );
</script>

<div class="map-wrapper">
    <svg
        bind:this={svgElement}
        viewBox="{activeViewBox.x} {activeViewBox.y} {activeViewBox.w} {activeViewBox.h}"
        xmlns="http://www.w3.org/2000/svg"
        class="star-map"
        class:panning={isPanning}
        onwheel={handleWheel}
        onmousedown={handlePanStart}
        onmousemove={handlePanMove}
        onmouseup={handlePanEnd}
        onmouseleave={handlePanEnd}
    >
        <!-- Background -->
        <rect x={activeViewBox.x - 1000} y={activeViewBox.y - 1000} width={activeViewBox.w + 2000} height={activeViewBox.h + 2000} fill="var(--color-map-bg)" />

        <!-- Jump lines (render first so they appear behind systems) -->
        {#each jumpLines as jl (jl.jump_line_id)}
            {@const fromSys = systemLookup[jl.from_system_id]}
            {@const toSys = systemLookup[jl.to_system_id]}
            {#if fromSys && toSys}
                <line
                    x1={fromSys.x}
                    y1={fromSys.y}
                    x2={toSys.x}
                    y2={toSys.y}
                    stroke="var(--color-jump-line)"
                    stroke-width="1.5"
                    stroke-opacity="0.6"
                />
            {/if}
        {/each}

        <!-- Star systems -->
        {#each systems as system (system.system_id)}
            {@const isSelected = selectedSystem?.system_id === system.system_id}
            {@const isHovered = hoveredSystem?.system_id === system.system_id}
            {@const lbl = labelPlacements[system.system_id]}
            <g
                class="system-node"
                onclick={() => { if (!didDrag) handleClick(system); }}
                onkeydown={(e) => handleKeyDown(e, system)}
                onmouseenter={(e) => handleMouseEnter(system, e)}
                onmouseleave={handleMouseLeave}
                role="button"
                tabindex="0"
            >
                <!-- Selection ring -->
                {#if isSelected}
                    <circle
                        cx={system.x}
                        cy={system.y}
                        r={systemRadius(system) + 5}
                        fill="none"
                        stroke="white"
                        stroke-width="2"
                        stroke-dasharray="4 2"
                    />
                {/if}

                <!-- Hover glow -->
                {#if isHovered}
                    <circle
                        cx={system.x}
                        cy={system.y}
                        r={systemRadius(system) + 3}
                        fill={systemColor(system)}
                        opacity="0.3"
                    />
                {/if}

                <!-- System circle -->
                <circle
                    cx={system.x}
                    cy={system.y}
                    r={systemRadius(system)}
                    fill={systemColor(system)}
                    stroke={isSelected ? 'white' : 'var(--color-system-stroke)'}
                    stroke-width={isSelected ? 2 : 1}
                />

                <!-- System label (centered on system) -->
                {#if system.is_founders_world}
                    <text
                        x={system.x}
                        y={system.y + 1}
                        text-anchor="middle"
                        dominant-baseline="middle"
                        fill="black"
                        font-size="16"
                        font-weight="bold"
                    >FW</text>
                {:else}
                    {@const fontSize = system.is_home_system ? 11 : 9}
                    {@const iconW = system.is_home_system ? 10 : 8}
                    {@const charW = fontSize * 0.6}
                    {@const gap = 1}
                    {@const rowSpacing = system.is_home_system ? 14 : 11}
                    {@const miningDigits = String(system.mining_value).length}
                    {@const matDigits = String(system.materials ?? 0).length}
                    {@const miningTotalW = iconW + gap + miningDigits * charW}
                    {@const matTotalW = iconW + gap + matDigits * charW}
                    <!-- Mining value row (pickaxe + number) -->
                    <g transform="translate({system.x - miningTotalW / 2}, {system.y - rowSpacing / 2 - iconW * 0.35})">
                        <!-- Pickaxe icon: handle going down-left, head tilted right -->
                        <g transform="scale({iconW / 12})">
                            <line x1="10" y1="1" x2="2" y2="9" stroke="black" stroke-width="1.8" stroke-linecap="round"/>
                            <path d="M7 0L11.5 1L10 5L8.5 3.2Z" fill="black" opacity="0.85"/>
                        </g>
                        <text
                            x={iconW + gap}
                            y={iconW * 0.5}
                            text-anchor="start"
                            dominant-baseline="middle"
                            fill="black"
                            font-size={fontSize}
                            font-weight="bold"
                        >{system.mining_value}</text>
                    </g>
                    <!-- Materials row (cubes + number) -->
                    <g transform="translate({system.x - matTotalW / 2}, {system.y + rowSpacing / 2 - iconW * 0.65})">
                        <!-- Stacked cubes icon -->
                        <g transform="scale({iconW / 12})">
                            <rect x="0" y="6" width="6" height="5" rx="0.5" fill="black" opacity="0.8"/>
                            <rect x="4" y="3" width="6" height="5" rx="0.5" fill="black" opacity="0.6"/>
                            <rect x="1.5" y="0" width="6" height="5" rx="0.5" fill="black" opacity="0.4"/>
                        </g>
                        <text
                            x={iconW + gap}
                            y={iconW * 0.5}
                            text-anchor="start"
                            dominant-baseline="middle"
                            fill="black"
                            font-size={fontSize}
                            font-weight="bold"
                        >{system.materials ?? 0}</text>
                    </g>
                {/if}

                <!-- System name label (dynamically placed to avoid overlap) -->
                {#if lbl}
                    <text
                        x={lbl.x}
                        y={lbl.y}
                        text-anchor={lbl.anchor}
                        fill="var(--color-text-muted)"
                        stroke="var(--color-map-bg)"
                        stroke-width="4"
                        paint-order="stroke"
                        font-size="11"
                        font-family="sans-serif"
                    >{system.name}</text>
                {/if}
            </g>
        {/each}
    </svg>

    <button class="reset-btn" onclick={resetView}>Reset View</button>

    <!-- Game chits (HTML overlays positioned over SVG) -->
    {#key chitVersion}
        {#each chitData as chit}
            {@const screenPos = viewBoxToScreen(chit.system.x + chit.pos.dx, chit.system.y + chit.pos.dy)}
            {@const scale = chitScale()}
            {@const size = CHIT_SIZE * scale}
            {@const digits = chit.type === 'ships' ? String(chit.count).length : 0}
            {@const shipH = size * 1.5}
            {@const shipW = shipH + digits * shipH * 0.45}
            {@const chitW = chit.type === 'ships' ? shipW : size}
            {@const chitH = chit.type === 'ships' ? shipH : size}
            <div
                class="chit chit-{chit.type}"
                style="
                    left: {screenPos.x - chitW / 2}px;
                    top: {screenPos.y - chitH / 2}px;
                    width: {chitW}px;
                    height: {chitH}px;
                    background: {playerColor(chit.playerIndex)};
                    font-size: {Math.max(9, chitH * 0.55)}px;
                "
                title="{chit.type === 'ships' ? `${chit.count} ships (${playerName(chit.playerIndex)})` : `${chit.type} (${playerName(chit.playerIndex)})`}"
            >
                {#if chit.type === 'mine'}
                    <svg viewBox="0 0 16 16" class="chit-icon">
                        <line x1="12" y1="2" x2="4" y2="12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
                        <path d="M9 1L14 2L12 7L10 4.5Z" fill="currentColor"/>
                    </svg>
                {:else if chit.type === 'shipyard'}
                    <svg viewBox="0 0 16 16" class="chit-icon">
                        <rect x="2" y="8" width="12" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/>
                        <polygon points="8,2 13,8 3,8" fill="none" stroke="currentColor" stroke-width="1.5"/>
                    </svg>
                {:else if chit.type === 'ships'}
                    <svg viewBox="0 0 20 28" class="ship-icon">
                        <path d="M10 1 C10 1, 6 7, 6 14 L6 20 L3.5 24 L3.5 27 L7 23.5 L7 27 L8.5 25 L10 27 L11.5 25 L13 27 L13 23.5 L16.5 27 L16.5 24 L14 20 L14 14 C14 7, 10 1, 10 1Z" fill="white"/>
                    </svg>
                    <span class="ship-count">{chit.count}</span>
                {/if}
            </div>
        {/each}
    {/key}

    <!-- Tooltip overlay (HTML positioned over SVG) -->
    {#if hoveredSystem}
        {@const sysShips = shipsBySystem()[hoveredSystem.system_id] || []}
        {@const sysStructs = structsBySystem()[hoveredSystem.system_id] || []}
        <div
            class="tooltip"
            style="left: {tooltipX + 15}px; top: {tooltipY - 10}px;"
        >
            <strong>{hoveredSystem.name}</strong>
            <div>Mining: {hoveredSystem.mining_value}</div>
            <div>Materials: {hoveredSystem.materials ?? 0}</div>
            {#if hoveredSystem.is_founders_world}
                <div class="special">Founder's World</div>
            {:else if hoveredSystem.is_home_system}
                <div class="special">Home ({playerName(hoveredSystem.owner_player_index)})</div>
            {:else if hoveredSystem.owner_player_index != null}
                <div class="special">Owner: {playerName(hoveredSystem.owner_player_index)}</div>
            {/if}
            {#each sysShips as sh}
                {#if sh.count > 0}
                    <div class="tooltip-piece">Ships: {sh.count} ({playerName(sh.player_index)})</div>
                {/if}
            {/each}
            {#each sysStructs as st}
                <div class="tooltip-piece">{st.structure_type} ({playerName(st.player_index)})</div>
            {/each}
        </div>
    {/if}
</div>

<style>
    .map-wrapper {
        position: relative;
        width: 100%;
        max-width: 1440px;
        aspect-ratio: 1440 / 840;
        margin: 0 auto;
        overflow: hidden;
        border: 1px solid var(--color-border);
        border-radius: 8px;
    }

    .star-map {
        width: 100%;
        height: 100%;
        cursor: grab;
    }

    .star-map.panning {
        cursor: grabbing;
    }

    .system-node {
        cursor: pointer;
    }

    .reset-btn {
        position: absolute;
        top: 8px;
        right: 8px;
        background: var(--color-bg-panel);
        border: 1px solid var(--color-border-light);
        border-radius: 4px;
        color: var(--color-text);
        padding: 4px 10px;
        cursor: pointer;
        font-size: 12px;
        z-index: 5;
    }

    .reset-btn:hover {
        background: var(--color-bg-panel-hover);
    }

    /* Chit overlays */
    .chit {
        position: absolute;
        border-radius: 3px;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        z-index: 4;
        border: 1px solid rgba(0,0,0,0.3);
        color: white;
        text-shadow: 0 1px 1px rgba(0,0,0,0.5);
    }

    .chit-icon {
        width: 70%;
        height: 70%;
        color: white;
    }

    .chit-ships {
        border-radius: 4px;
        flex-direction: row;
        gap: 1px;
        padding: 0 2px;
        border: 1.5px solid rgba(255,255,255,0.5);
        box-shadow: 0 1px 3px rgba(0,0,0,0.5);
    }

    .ship-icon {
        height: 80%;
        width: auto;
        flex-shrink: 0;
    }

    .ship-count {
        font-weight: 900;
        line-height: 1;
        color: white;
    }

    .tooltip {
        position: absolute;
        background: var(--color-bg-panel);
        border: 1px solid var(--color-border-light);
        border-radius: 6px;
        padding: 8px 12px;
        color: var(--color-text);
        font-size: 12px;
        pointer-events: none;
        z-index: 10;
        white-space: nowrap;
    }

    .tooltip .special {
        color: var(--color-accent);
        font-size: 11px;
        margin-top: 2px;
    }

    .tooltip .tooltip-piece {
        font-size: 11px;
        color: var(--color-text-dim);
        margin-top: 1px;
    }
</style>
