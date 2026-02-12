<script>
    let { systems = [], jumpLines = [], onSelectSystem = () => {} } = $props();

    // Build a lookup from system_id to system object for jump line rendering
    let systemLookup = $derived(
        Object.fromEntries(systems.map(s => [s.system_id, s]))
    );

    // Cluster colors for visual distinction
    const CLUSTER_COLORS = [
        '#e74c3c', '#3498db', '#2ecc71', '#f39c12',
        '#9b59b6', '#1abc9c', '#e67e22', '#34495e',
    ];

    function clusterColor(clusterId) {
        if (clusterId === -1) return '#f1c40f'; // Founder's World
        return CLUSTER_COLORS[clusterId % CLUSTER_COLORS.length];
    }

    function systemRadius(system) {
        if (system.is_founders_world) return 12;
        if (system.is_home_system) return 9;
        return 6;
    }

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

    // Pan/zoom state
    let viewBox = $state({ x: 0, y: 0, w: 1000, h: 800 });
    let isPanning = $state(false);
    let didDrag = $state(false);
    let panStartMouse = $state({ x: 0, y: 0 });
    let panStartViewBox = $state({ x: 0, y: 0 });

    const DRAG_THRESHOLD = 4; // pixels before a mousedown counts as a drag

    function handleWheel(event) {
        event.preventDefault();
        const zoomFactor = event.deltaY > 0 ? 1.1 : 0.9;
        const svg = event.currentTarget;
        const rect = svg.getBoundingClientRect();

        // Mouse position as fraction of SVG element
        const mx = (event.clientX - rect.left) / rect.width;
        const my = (event.clientY - rect.top) / rect.height;

        // Zoom centered on mouse position
        const newW = viewBox.w * zoomFactor;
        const newH = viewBox.h * zoomFactor;
        viewBox = {
            x: viewBox.x + (viewBox.w - newW) * mx,
            y: viewBox.y + (viewBox.h - newH) * my,
            w: newW,
            h: newH,
        };
    }

    function handlePanStart(event) {
        if (event.button !== 0) return; // Left-click only
        isPanning = true;
        didDrag = false;
        panStartMouse = { x: event.clientX, y: event.clientY };
        panStartViewBox = { x: viewBox.x, y: viewBox.y };
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
            const svgDx = dx / rect.width * viewBox.w;
            const svgDy = dy / rect.height * viewBox.h;
            viewBox = {
                ...viewBox,
                x: panStartViewBox.x - svgDx,
                y: panStartViewBox.y - svgDy,
            };
        }
    }

    function handlePanEnd() {
        isPanning = false;
    }

    function resetView() {
        viewBox = { x: 0, y: 0, w: 1000, h: 800 };
    }

    // Tooltip position
    let tooltipX = $state(0);
    let tooltipY = $state(0);

    function handleMouseEnter(system, event) {
        hoveredSystem = system;
        const svg = event.currentTarget.closest('svg');
        const rect = svg.getBoundingClientRect();
        // Convert SVG coordinates to screen coordinates accounting for viewBox
        const scaleX = rect.width / viewBox.w;
        const scaleY = rect.height / viewBox.h;
        tooltipX = (system.x - viewBox.x) * scaleX;
        tooltipY = (system.y - viewBox.y) * scaleY;
    }

    function handleMouseLeave() {
        hoveredSystem = null;
    }
</script>

<div class="map-wrapper">
    <svg
        viewBox="{viewBox.x} {viewBox.y} {viewBox.w} {viewBox.h}"
        xmlns="http://www.w3.org/2000/svg"
        class="star-map"
        onwheel={handleWheel}
        onmousedown={handlePanStart}
        onmousemove={handlePanMove}
        onmouseup={handlePanEnd}
        onmouseleave={handlePanEnd}
    >
        <!-- Background -->
        <rect x={viewBox.x} y={viewBox.y} width={viewBox.w} height={viewBox.h} fill="#0a0a1a" />

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
                    stroke="#334"
                    stroke-width="1.5"
                    stroke-opacity="0.6"
                />
            {/if}
        {/each}

        <!-- Star systems -->
        {#each systems as system (system.system_id)}
            {@const isSelected = selectedSystem?.system_id === system.system_id}
            {@const isHovered = hoveredSystem?.system_id === system.system_id}
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
                        fill={clusterColor(system.cluster_id)}
                        opacity="0.3"
                    />
                {/if}

                <!-- System circle -->
                <circle
                    cx={system.x}
                    cy={system.y}
                    r={systemRadius(system)}
                    fill={clusterColor(system.cluster_id)}
                    stroke={isSelected ? 'white' : '#222'}
                    stroke-width={isSelected ? 2 : 1}
                />

                <!-- Mining value indicator -->
                {#if system.is_founders_world}
                    <text
                        x={system.x}
                        y={system.y + 1}
                        text-anchor="middle"
                        dominant-baseline="middle"
                        fill="black"
                        font-size="8"
                        font-weight="bold"
                    >FW</text>
                {/if}

                <!-- System name label -->
                <text
                    x={system.x}
                    y={system.y + systemRadius(system) + 12}
                    text-anchor="middle"
                    fill="#aaa"
                    font-size="8"
                    font-family="sans-serif"
                >{system.name}</text>
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
        border: 1px solid #333;
        border-radius: 8px;
    }

    .system-node {
        cursor: pointer;
    }

    .reset-btn {
        position: absolute;
        top: 8px;
        right: 8px;
        background: #1a1a2e;
        border: 1px solid #555;
        border-radius: 4px;
        color: #eee;
        padding: 4px 10px;
        cursor: pointer;
        font-size: 12px;
        z-index: 5;
    }

    .reset-btn:hover {
        background: #2a2a3e;
    }

    .tooltip {
        position: absolute;
        background: #1a1a2e;
        border: 1px solid #555;
        border-radius: 6px;
        padding: 8px 12px;
        color: #eee;
        font-size: 12px;
        pointer-events: none;
        z-index: 10;
        white-space: nowrap;
    }

    .tooltip .special {
        color: #f1c40f;
        font-size: 11px;
        margin-top: 2px;
    }
</style>
