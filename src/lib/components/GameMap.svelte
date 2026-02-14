<script>
    let { systems = [], jumpLines = [], onSelectSystem = () => {} } = $props();

    // Build a lookup from system_id to system object for jump line rendering
    let systemLookup = $derived(
        Object.fromEntries(systems.map(s => [s.system_id, s]))
    );

    // Player colors for owned systems
    const PLAYER_COLORS = [
        '#e74c3c', '#3498db', '#2ecc71', '#f39c12',
        '#9b59b6', '#1abc9c', '#e67e22', '#34495e',
    ];

    function systemColor(system) {
        if (system.is_founders_world) return 'var(--color-accent)';
        if (system.owner_player_index != null) return PLAYER_COLORS[system.owner_player_index % PLAYER_COLORS.length];
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
    const ASPECT = 1000 / 800; // match the aspect-ratio in CSS

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
</script>

<div class="map-wrapper">
    <svg
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

    <!-- Tooltip overlay (HTML positioned over SVG) -->
    {#if hoveredSystem}
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
                <div class="special">Home System (Player {hoveredSystem.owner_player_index + 1})</div>
            {/if}
        </div>
    {/if}
</div>

<style>
    .map-wrapper {
        position: relative;
        width: 100%;
        max-width: 1000px;
        aspect-ratio: 1000 / 800;
        margin: 0 auto;
    }

    .star-map {
        width: 100%;
        height: 100%;
        border: 1px solid var(--color-border);
        border-radius: 8px;
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
</style>
