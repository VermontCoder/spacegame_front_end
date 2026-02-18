import { apiFetch } from '$lib/auth.svelte.js';

let orders = $state([]);
let loading = $state(false);
let submitted = $state(false);

export function getOrders() { return orders; }
export function isOrdersLoading() { return loading; }
export function isSubmitted() { return submitted; }

export async function loadOrders(gameId, turnId) {
    loading = true;
    try {
        const res = await apiFetch(`/games/${gameId}/turns/${turnId}/orders`);
        if (res.ok) orders = await res.json();
    } catch (e) {
        console.error('Failed to load orders:', e);
    }
    loading = false;
}

export async function loadTurnStatus(gameId, turnId) {
    try {
        const res = await apiFetch(`/games/${gameId}/turns/${turnId}/status`);
        if (res.ok) return await res.json();
    } catch (e) {
        console.error('Failed to load turn status:', e);
    }
    return [];
}

export async function createOrder(gameId, turnId, orderData) {
    const res = await apiFetch(`/games/${gameId}/turns/${turnId}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData),
    });
    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to create order');
    }
    const newOrder = await res.json();
    orders = [...orders, newOrder];
    return newOrder;
}

export async function cancelOrder(gameId, turnId, orderId) {
    const res = await apiFetch(`/games/${gameId}/turns/${turnId}/orders/${orderId}`, {
        method: 'DELETE',
    });
    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to cancel order');
    }
    orders = orders.filter(o => o.order_id !== orderId);
}

export async function submitTurn(gameId, turnId) {
    const res = await apiFetch(`/games/${gameId}/turns/${turnId}/submit`, {
        method: 'POST',
    });
    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to submit turn');
    }
    submitted = true;
    return await res.json();
}

export function setSubmitted(val) {
    submitted = val;
}

export function resetOrderState() {
    orders = [];
    submitted = false;
    loading = false;
}
