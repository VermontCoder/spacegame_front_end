import { env } from '$env/dynamic/public';

/** @type {any} */
let user = $state(null);
/** @type {string | null} */
let token = $state(null);
let loading = $state(true);

export function getUser() { return user; }
export function getToken() { return token; }
export function isLoading() { return loading; }
export function isAuthenticated() { return !!user; }

export async function initAuth() {
    const saved = localStorage.getItem('spacegame_token');
    if (!saved) {
        loading = false;
        return;
    }
    token = saved;
    try {
        const res = await apiFetch('/auth/me');
        if (res.ok) {
            user = await res.json();
        } else {
            token = null;
            localStorage.removeItem('spacegame_token');
        }
    } catch {
        token = null;
        localStorage.removeItem('spacegame_token');
    }
    loading = false;
}

/**
 * @param {string} username
 * @param {string} firstName
 * @param {string} lastName
 * @param {string} email
 * @param {string} password
 */
export async function register(username, firstName, lastName, email, password) {
    const res = await apiFetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username,
            first_name: firstName,
            last_name: lastName,
            email,
            password,
        }),
    });
    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Registration failed');
    }
    const data = await res.json();
    token = data.access_token;
    user = data.user;
    localStorage.setItem('spacegame_token', /** @type {string} */ (token));
}

/**
 * @param {string} username
 * @param {string} password
 */
export async function login(username, password) {
    const res = await apiFetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Login failed');
    }
    const data = await res.json();
    token = data.access_token;
    user = data.user;
    localStorage.setItem('spacegame_token', /** @type {string} */ (token));
}

export function logout() {
    user = null;
    token = null;
    localStorage.removeItem('spacegame_token');
}

/**
 * @param {string} path
 * @param {RequestInit} [options]
 */
export async function apiFetch(path, options = {}) {
    const headers = /** @type {Record<string, string>} */ ({ ...options.headers });
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return fetch(`${env.FAST_API_URL}${path}`, { ...options, headers });
}
