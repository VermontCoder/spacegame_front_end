<script>
    let {
        orders = [],
        systemLookup = {},
        playerColor = '#888',
        submitted = false,
        onCancel = () => {},
        onSubmit = () => {},
        hoveredOrderId = $bindable(null),
        orderError = null,
    } = $props();

    function orderSummary(order) {
        const source = systemLookup[order.source_system_id];
        const sourceName = source?.name ?? `System ${order.source_system_id}`;

        if (order.order_type === 'move_ships') {
            const target = systemLookup[order.target_system_id];
            const targetName = target?.name ?? `System ${order.target_system_id}`;
            return `Move ${order.quantity} ship${order.quantity !== 1 ? 's' : ''}: ${sourceName} → ${targetName}`;
        }
        if (order.order_type === 'build_mine') {
            return `Build Mine at ${sourceName}`;
        }
        if (order.order_type === 'build_shipyard') {
            return `Build Shipyard at ${sourceName}`;
        }
        if (order.order_type === 'build_ships') {
            return `Build ${order.quantity} ship${order.quantity !== 1 ? 's' : ''} at ${sourceName}`;
        }
        return `${order.order_type} at ${sourceName}`;
    }

    function orderIcon(order) {
        if (order.order_type === 'move_ships') return '→';
        if (order.order_type === 'build_mine') return '⛏';
        if (order.order_type === 'build_shipyard') return '⚓';
        if (order.order_type === 'build_ships') return '🚀';
        return '•';
    }
</script>

<div class="orders-panel">
    <h2>Orders ({orders.length})</h2>

    {#if orderError}
        <div class="order-error">{orderError}</div>
    {/if}

    {#if orders.length === 0}
        <p class="empty-msg">No orders yet. Click a system to begin.</p>
    {:else}
        <ul class="order-list">
            {#each orders as order (order.order_id)}
                <li
                    class="order-item"
                    class:hovered={hoveredOrderId === order.order_id}
                    onmouseenter={() => hoveredOrderId = order.order_id}
                    onmouseleave={() => hoveredOrderId = null}
                >
                    <span class="order-icon">{orderIcon(order)}</span>
                    <span class="order-text">{orderSummary(order)}</span>
                    {#if !submitted}
                        <button
                            class="cancel-btn"
                            onclick={() => onCancel(order.order_id)}
                            title="Cancel order"
                        >✕</button>
                    {/if}
                </li>
            {/each}
        </ul>
    {/if}

    {#if submitted}
        <div class="submitted-msg">Waiting for other players...</div>
    {:else}
        <button
            class="submit-btn"
            onclick={onSubmit}
            disabled={orders.length === 0}
        >Submit Turn</button>
    {/if}
</div>

<style>
    .orders-panel {
        background: var(--color-bg-panel);
        border: 1px solid var(--color-border);
        border-radius: 8px;
        padding: 1rem;
    }

    h2 {
        margin: 0 0 0.5rem;
        font-size: 1.1rem;
        color: var(--color-accent);
    }

    .order-error {
        background: rgba(231, 76, 60, 0.15);
        border: 1px solid var(--color-error);
        border-radius: 4px;
        color: var(--color-error);
        padding: 0.4rem 0.6rem;
        font-size: 0.85rem;
        margin-bottom: 0.5rem;
    }

    .empty-msg {
        color: var(--color-text-dim);
        font-size: 0.85rem;
        margin: 0.25rem 0;
    }

    .order-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }

    .order-item {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.35rem 0.5rem;
        border-radius: 4px;
        border: 1px solid transparent;
        font-size: 0.85rem;
        transition: background 0.15s, border-color 0.15s;
    }

    .order-item:hover,
    .order-item.hovered {
        background: var(--color-bg-panel-hover);
        border-color: var(--color-border-light);
    }

    .order-icon {
        flex-shrink: 0;
        font-size: 0.9rem;
    }

    .order-text {
        flex: 1;
        color: var(--color-text);
    }

    .cancel-btn {
        flex-shrink: 0;
        background: none;
        border: none;
        color: var(--color-text-dim);
        cursor: pointer;
        padding: 0 0.25rem;
        font-size: 0.9rem;
        line-height: 1;
    }

    .cancel-btn:hover {
        color: var(--color-error);
    }

    .submit-btn {
        display: block;
        width: 100%;
        margin-top: 0.75rem;
        padding: 0.5rem;
        background: var(--color-accent);
        color: #000;
        border: none;
        border-radius: 6px;
        font-weight: 600;
        cursor: pointer;
        font-size: 0.95rem;
    }

    .submit-btn:hover:not(:disabled) {
        filter: brightness(1.1);
    }

    .submit-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }

    .submitted-msg {
        margin-top: 0.75rem;
        text-align: center;
        color: var(--color-accent);
        font-size: 0.9rem;
        font-weight: 500;
    }
</style>
