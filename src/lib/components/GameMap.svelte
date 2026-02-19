<script>
    let {
        systems = [],
        jumpLines = [],
        ships = [],
        structures = [],
        players = [],
        orders = [],
        moveSourceSystem = null,
        validMoveTargets = new Set(),
        hoveredOrderId = null,
        currentPlayerIndex = null,
        onSelectSystem = () => {},
        mineFundingMode = false,
        mineTargetSystemId = null,
        eligibleFundingSystems = [],
        mineFunding = {},
        onAdjustFunding = () => {},
        combatSystems = [],
        onCombatClick = () => {},
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
    const ASPECT = 1656 / 1260; // match the aspect-ratio in CSS

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
        const offset = r + 6;
        return {
            mine:     { dx: -offset * Math.cos(Math.PI / 6), dy: offset * Math.sin(Math.PI / 6) },   // 8 o'clock
            shipyard: { dx: offset * Math.cos(Math.PI / 6),  dy: offset * Math.sin(Math.PI / 6) },    // 4 o'clock
            ships:    { dx: 0, dy: -(offset + 6) },                                                      // 12 o'clock
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
                const building = ship.building ?? 0;
                if (ship.count > 0 || building > 0) {
                    result.push({
                        type: 'ships',
                        system: sys,
                        playerIndex: ship.player_index,
                        count: ship.count,
                        building,
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

    // --- Order visualization data ---
    let currentPlayerColor = $derived(
        currentPlayerIndex != null ? playerColor(currentPlayerIndex) : '#888'
    );

    // Move orders: compute arrow paths
    let moveOrderArrows = $derived.by(() => {
        const allMoveOrders = orders.filter(o => o.order_type === 'move_ships');

        // Detect bidirectional pairs (A→B and B→A both present)
        const pairKeys = new Set();
        const biPairs = new Set();
        for (const o of allMoveOrders) {
            const key = `${Math.min(o.source_system_id, o.target_system_id)}-${Math.max(o.source_system_id, o.target_system_id)}`;
            if (pairKeys.has(key)) biPairs.add(key);
            else pairKeys.add(key);
        }

        return allMoveOrders
            .map(o => {
                const from = systemLookup[o.source_system_id];
                const to = systemLookup[o.target_system_id];
                if (!from || !to) return null;
                const dx = to.x - from.x;
                const dy = to.y - from.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist === 0) return null;
                const nx = dx / dist;
                const ny = dy / dist;
                const fromR = systemRadius(from) + 4;

                const pairKey = `${Math.min(o.source_system_id, o.target_system_id)}-${Math.max(o.source_system_id, o.target_system_id)}`;

                if (biPairs.has(pairKey)) {
                    // Half-arrow: source edge → just before midpoint, arrowheads face each other
                    const midX = (from.x + to.x) / 2;
                    const midY = (from.y + to.y) / 2;
                    const GAP = 6; // viewBox units from center to each arrowhead tip
                    const x1 = from.x + nx * fromR;
                    const y1 = from.y + ny * fromR;
                    const x2 = midX - nx * GAP;
                    const y2 = midY - ny * GAP;
                    return {
                        order: o,
                        x1, y1, x2, y2,
                        mx: (x1 + x2) / 2,
                        my: (y1 + y2) / 2,
                    };
                } else {
                    const toR = systemRadius(to) + 6;
                    return {
                        order: o,
                        x1: from.x + nx * fromR,
                        y1: from.y + ny * fromR,
                        x2: to.x - nx * toR,
                        y2: to.y - ny * toR,
                        mx: (from.x + to.x) / 2,
                        my: (from.y + to.y) / 2,
                    };
                }
            })
            .filter(Boolean);
    });

    // Build orders: ghost overlays
    let buildMineOrders = $derived(
        orders.filter(o => o.order_type === 'build_mine')
    );
    let buildYardOrders = $derived(
        orders.filter(o => o.order_type === 'build_shipyard')
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

        <!-- Move source system highlight -->
        {#if moveSourceSystem}
            {@const src = systemLookup[moveSourceSystem.system_id]}
            {#if src}
                <circle
                    cx={src.x}
                    cy={src.y}
                    r={systemRadius(src) + 8}
                    fill="none"
                    stroke={currentPlayerColor}
                    stroke-width="3"
                    stroke-opacity="0.8"
                    class="source-glow"
                />
            {/if}
        {/if}

        <!-- Valid move destination highlights -->
        {#each systems as system (system.system_id)}
            {#if validMoveTargets.has(system.system_id)}
                <circle
                    cx={system.x}
                    cy={system.y}
                    r={systemRadius(system) + 6}
                    fill="none"
                    stroke={currentPlayerColor}
                    stroke-width="2"
                    stroke-dasharray="5 3"
                    stroke-opacity="0.6"
                />
            {/if}
        {/each}

        <!-- Mine funding mode: target highlight + eligible system rings -->
        {#if mineFundingMode}
            {#if mineTargetSystemId}
                {@const tgt = systemLookup[mineTargetSystemId]}
                {#if tgt}
                    <circle
                        cx={tgt.x}
                        cy={tgt.y}
                        r={systemRadius(tgt) + 8}
                        fill="none"
                        stroke="#f39c12"
                        stroke-width="2.5"
                        stroke-dasharray="5 3"
                        class="source-glow"
                    />
                {/if}
            {/if}
            {#each eligibleFundingSystems as sys}
                {@const alloc = mineFunding[sys.system_id] ?? 0}
                <circle
                    cx={sys.x}
                    cy={sys.y}
                    r={systemRadius(sys) + 6}
                    fill="none"
                    stroke={alloc > 0 ? '#2ecc71' : 'rgba(46,204,113,0.5)'}
                    stroke-width={alloc > 0 ? 2 : 1.5}
                    stroke-dasharray={alloc > 0 ? 'none' : '4 3'}
                />
            {/each}
        {/if}

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

        <!-- Move order arrows -->
        <defs>
            <marker id="order-arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill={currentPlayerColor} opacity="0.8" />
            </marker>
        </defs>
        {#each moveOrderArrows as arrow}
            {@const isHighlighted = hoveredOrderId === arrow.order.order_id}
            <line
                x1={arrow.x1}
                y1={arrow.y1}
                x2={arrow.x2}
                y2={arrow.y2}
                stroke={currentPlayerColor}
                stroke-width={isHighlighted ? 3 : 2}
                stroke-opacity={isHighlighted ? 1 : 0.6}
                marker-end="url(#order-arrowhead)"
            />
            <!-- Ship count at midpoint -->
            <circle cx={arrow.mx} cy={arrow.my} r="10" fill="var(--color-map-bg)" stroke={currentPlayerColor} stroke-width="1" opacity="0.9" />
            <text
                x={arrow.mx}
                y={arrow.my + 1}
                text-anchor="middle"
                dominant-baseline="middle"
                fill={currentPlayerColor}
                font-size="10"
                font-weight="bold"
            >{arrow.order.quantity}</text>
        {/each}

        <!-- Ghost build indicators (in SVG space) -->
        {#each buildMineOrders as order}
            {@const sys = systemLookup[order.source_system_id]}
            {#if sys}
                {@const pos = chitPositions(sys)}
                {@const isHov = hoveredOrderId === order.order_id}
                <g transform="translate({sys.x + pos.mine.dx - 7}, {sys.y + pos.mine.dy - 7})">
                    <rect width="14" height="14" rx="2" fill="black" stroke="white" stroke-width={isHov ? 2 : 1.5} stroke-opacity={isHov ? 1 : 0.8}/>
                    <!-- Mine icon scaled to fill tile (16×16 viewbox → 10×10, offset 2px) -->
                    <g transform="translate(2, 2) scale(0.625)">
                        <line x1="12" y1="2" x2="4" y2="12" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
                        <path d="M9 1L14 2L12 7L10 4.5Z" fill="white"/>
                    </g>
                </g>
            {/if}
        {/each}
        {#each buildYardOrders as order}
            {@const sys = systemLookup[order.source_system_id]}
            {#if sys}
                {@const pos = chitPositions(sys)}
                {@const isHov = hoveredOrderId === order.order_id}
                <g transform="translate({sys.x + pos.shipyard.dx - 7}, {sys.y + pos.shipyard.dy - 7})">
                    <rect width="14" height="14" rx="2" fill="black" stroke="white" stroke-width={isHov ? 2 : 1.5} stroke-opacity={isHov ? 1 : 0.8}/>
                    <!-- Shipyard icon scaled to fill tile (16×16 viewbox → 10×10, offset 2px) -->
                    <g transform="translate(2, 2) scale(0.625)">
                        <rect x="2" y="8" width="12" height="6" rx="1" fill="none" stroke="white" stroke-width="1.5"/>
                        <polygon points="8,2 13,8 3,8" fill="none" stroke="white" stroke-width="1.5"/>
                    </g>
                </g>
            {/if}
        {/each}
    </svg>

    <button class="reset-btn" onclick={resetView}>Reset View</button>

    <!-- Game chits (HTML overlays positioned over SVG) -->
    {#key chitVersion}
        {#each chitData as chit}
            {@const screenPos = viewBoxToScreen(chit.system.x + chit.pos.dx, chit.system.y + chit.pos.dy)}
            {@const scale = chitScale()}
            {@const size = CHIT_SIZE * scale}
            {@const shipLabel = chit.type === 'ships' ? (chit.building > 0 ? `${chit.count}\\${chit.building}` : `${chit.count}`) : ''}
            {@const labelLen = shipLabel.length}
            {@const shipH = size * 1.5}
            {@const shipW = shipH + labelLen * shipH * 0.45}
            {@const chitW = chit.type === 'ships' ? shipW : size}
            {@const chitH = chit.type === 'ships' ? shipH : size}
            <div
                class="chit chit-{chit.type}"
                style="
                    left: {screenPos.x - chitW / 2 - (chit.type === 'ships' ? 2 + labelLen * 0.2 : 0)}px;
                    top: {screenPos.y - chitH / 2}px;
                    width: {chitW}px;
                    height: {chitH}px;
                    background: {playerColor(chit.playerIndex)};
                    font-size: {Math.max(9, chitH * 0.55)}px;
                "
                title="{chit.type === 'ships' ? `${chit.count}${chit.building > 0 ? `\\${chit.building}` : ''} ships (${playerName(chit.playerIndex)})` : `${chit.type} (${playerName(chit.playerIndex)})`}"
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
                    <span class="ship-count">{shipLabel}</span>
                {/if}
            </div>
        {/each}
    {/key}

    <!-- Combat badges (HTML overlays) -->
    {#key chitVersion}
        {#each combatSystems as sysId (sysId)}
            {@const sys = systems.find(s => s.system_id === sysId)}
            {#if sys}
                {@const screenPos = viewBoxToScreen(sys.x, sys.y)}
                {@const r = systemRadius(sys)}
                {@const scale = chitScale()}
                {@const offsetY = (r + 22.5) * scale + 16}
                <div
                    class="combat-badge"
                    style="left: {screenPos.x}px; top: {screenPos.y - offsetY}px;"
                    onclick={() => onCombatClick(sysId)}
                    role="button"
                    tabindex="0"
                    onkeydown={(e) => e.key === 'Enter' && onCombatClick(sysId)}
                >&#9876;</div>
            {/if}
        {/each}
    {/key}

    <!-- Mine funding counters (HTML overlays, pointer-events enabled) -->
    {#if mineFundingMode}
        {#key chitVersion}
            {#each eligibleFundingSystems as sys}
                {@const alloc = mineFunding[sys.system_id] ?? 0}
                {@const total = Object.values(mineFunding).reduce((s, v) => s + v, 0)}
                {@const r = systemRadius(sys)}
                {@const pos = viewBoxToScreen(sys.x, sys.y + r + 12)}
                <div
                    class="fund-counter"
                    style="left: {pos.x}px; top: {pos.y}px;"
                >
                    <button
                        class="fund-btn"
                        onclick={() => onAdjustFunding(sys.system_id, -1)}
                        disabled={alloc <= 0}
                    >−</button>
                    <span class="fund-amount" class:funded={alloc > 0}>{alloc}</span>
                    <button
                        class="fund-btn"
                        onclick={() => onAdjustFunding(sys.system_id, +1)}
                        disabled={total >= 15 || alloc >= sys.materials}
                    >+</button>
                </div>
            {/each}
        {/key}
    {/if}

    <!-- Tooltip overlay (HTML positioned over SVG) -->
    {#if hoveredSystem}
        {@const sysShips = shipsBySystem()[hoveredSystem.system_id] || []}
        {@const sysStructs = structsBySystem()[hoveredSystem.system_id] || []}
        {@const totalShips = sysShips.reduce((s, sh) => s + sh.count, 0)}
        {@const hasMine = sysStructs.some(st => st.structure_type === 'mine')}
        {@const hasYard = sysStructs.some(st => st.structure_type === 'shipyard')}
        {@const ownerLabel = hoveredSystem.is_founders_world ? 'Founder\'s World' : (hoveredSystem.owner_player_index != null ? playerName(hoveredSystem.owner_player_index) : 'None')}
        {@const ownerColor = hoveredSystem.owner_player_index != null ? playerColor(hoveredSystem.owner_player_index) : 'var(--color-text-dim)'}
        <div
            class="tooltip"
            style="left: {tooltipX + 15}px; top: {tooltipY - 10}px;"
        >
            <div class="tt-header" style="color: {ownerColor}">{hoveredSystem.name} — {ownerLabel}</div>
            <div class="tt-row">
                <!-- Pickaxe (mining) -->
                <svg viewBox="0 0 16 16" class="tt-icon"><line x1="12" y1="2" x2="4" y2="12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><path d="M9 1L14 2L12 7L10 4.5Z" fill="currentColor"/></svg>
                <span>{hoveredSystem.mining_value}</span>
                <!-- Cube (materials) -->
                <svg viewBox="0 0 16 16" class="tt-icon tt-gap"><polygon points="8,2 14,5 14,11 8,14 2,11 2,5" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="2" y1="5" x2="8" y2="8" stroke="currentColor" stroke-width="1.5"/><line x1="14" y1="5" x2="8" y2="8" stroke="currentColor" stroke-width="1.5"/><line x1="8" y1="8" x2="8" y2="14" stroke="currentColor" stroke-width="1.5"/></svg>
                <span>{hoveredSystem.materials ?? 0}</span>
                {#if totalShips > 0}
                    <!-- Rocket (ships) -->
                    <svg viewBox="0 0 20 28" class="tt-icon tt-gap tt-ship"><path d="M10 1 C10 1, 6 7, 6 14 L6 20 L3.5 24 L3.5 27 L7 23.5 L7 27 L8.5 25 L10 27 L11.5 25 L13 27 L13 23.5 L16.5 27 L16.5 24 L14 20 L14 14 C14 7, 10 1, 10 1Z" fill="currentColor"/></svg>
                    <span>{totalShips}</span>
                {/if}
                {#if hasMine}
                    <!-- Mine chit tile -->
                    <div class="tt-chit tt-gap" style="background: {ownerColor}">
                        <svg viewBox="0 0 16 16" class="tt-chit-icon"><line x1="12" y1="2" x2="4" y2="12" stroke="white" stroke-width="2.5" stroke-linecap="round"/><path d="M9 1L14 2L12 7L10 4.5Z" fill="white"/></svg>
                    </div>
                {/if}
                {#if hasYard}
                    <!-- Shipyard chit tile -->
                    <div class="tt-chit tt-gap" style="background: {ownerColor}">
                        <svg viewBox="0 0 16 16" class="tt-chit-icon"><rect x="2" y="8" width="12" height="6" rx="1" fill="none" stroke="white" stroke-width="1.5"/><polygon points="8,2 13,8 3,8" fill="none" stroke="white" stroke-width="1.5"/></svg>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
</div>

<style>
    .map-wrapper {
        position: relative;
        width: 100%;
        max-width: 1656px;
        aspect-ratio: 1656 / 1260;
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

    .source-glow {
        animation: pulse-glow 1.5s ease-in-out infinite;
    }

    @keyframes pulse-glow {
        0%, 100% { stroke-opacity: 0.4; }
        50% { stroke-opacity: 1; }
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
        padding: 6px 10px;
        color: var(--color-text);
        font-size: 12px;
        pointer-events: none;
        z-index: 10;
        white-space: nowrap;
    }

    .tt-header {
        font-weight: bold;
        margin-bottom: 4px;
    }

    .tt-row {
        display: flex;
        align-items: center;
        gap: 3px;
    }

    .tt-icon {
        width: 13px;
        height: 13px;
        flex-shrink: 0;
        color: var(--color-text-dim);
    }

    .tt-ship {
        width: 10px;
        height: 14px;
    }

    .tt-gap {
        margin-left: 6px;
    }

    .tt-chit {
        width: 14px;
        height: 14px;
        border-radius: 3px;
        border: 1px solid rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }

    .tt-chit-icon {
        width: 70%;
        height: 70%;
    }

    /* Mine funding counters */
    /* Combat badges */
    .combat-badge {
        position: absolute;
        transform: translate(-50%, -50%);
        background: rgba(220, 50, 50, 0.85);
        color: white;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        cursor: pointer;
        pointer-events: all;
        z-index: 20;
        border: 1px solid rgba(255,255,255,0.5);
    }

    .combat-badge:hover {
        background: rgba(220, 50, 50, 1);
        transform: translate(-50%, -50%) scale(1.15);
    }

    .fund-counter {
        position: absolute;
        transform: translate(-50%, 0);
        display: flex;
        align-items: center;
        gap: 2px;
        background: var(--color-bg-panel);
        border: 1.5px solid #2ecc71;
        border-radius: 4px;
        padding: 1px 4px;
        z-index: 6;
        pointer-events: auto;
        white-space: nowrap;
    }

    .fund-btn {
        background: none;
        border: none;
        color: var(--color-text);
        cursor: pointer;
        font-size: 14px;
        font-weight: bold;
        line-height: 1;
        padding: 0 2px;
        min-width: 14px;
    }

    .fund-btn:disabled {
        opacity: 0.25;
        cursor: not-allowed;
    }

    .fund-amount {
        min-width: 18px;
        text-align: center;
        font-size: 12px;
        font-weight: bold;
        color: var(--color-text-dim);
    }

    .fund-amount.funded {
        color: #2ecc71;
    }
</style>
