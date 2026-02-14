<script>
    import { isAuthenticated, isLoading, getUser, register, login, logout } from '$lib/auth.svelte.js';

    let mode = $state('login');
    let username = $state('');
    let password = $state('');
    let firstName = $state('');
    let lastName = $state('');
    let email = $state('');
    let error = $state('');
    let submitting = $state(false);

    let authenticated = $derived(isAuthenticated());
    let authLoading = $derived(isLoading());
    let user = $derived(getUser());

    async function handleSubmit() {
        error = '';
        submitting = true;
        try {
            if (mode === 'register') {
                await register(username, firstName, lastName, email, password);
            } else {
                await login(username, password);
            }
        } catch (/** @type {any} */ e) {
            error = e.message;
        } finally {
            submitting = false;
        }
    }
</script>

{#if authLoading}
    <div class="loading">Loading...</div>
{:else if authenticated}
    <div class="lobby">
        <h1>Welcome, {user?.first_name}!</h1>
        <p class="placeholder">The game lobby is coming soon. From here you'll be able to create games, join open games, and continue your active games.</p>
        <button class="logout-btn" onclick={() => logout()}>Log Out</button>
    </div>
{:else}
    <div class="auth-container">
        <h1>SpaceGame</h1>

        <div class="mode-toggle">
            <button class:active={mode === 'login'} onclick={() => { mode = 'login'; error = ''; }}>
                Log In
            </button>
            <button class:active={mode === 'register'} onclick={() => { mode = 'register'; error = ''; }}>
                Register
            </button>
        </div>

        <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
            <label>
                Username
                <input type="text" bind:value={username} required autocomplete="username" />
            </label>

            {#if mode === 'register'}
                <label>
                    First Name
                    <input type="text" bind:value={firstName} required />
                </label>
                <label>
                    Last Name
                    <input type="text" bind:value={lastName} required />
                </label>
                <label>
                    Email
                    <input type="email" bind:value={email} required autocomplete="email" />
                </label>
            {/if}

            <label>
                Password
                <input type="password" bind:value={password} required autocomplete={mode === 'login' ? 'current-password' : 'new-password'} />
            </label>

            {#if error}
                <p class="error">{error}</p>
            {/if}

            <button type="submit" disabled={submitting}>
                {submitting ? 'Please wait...' : mode === 'login' ? 'Log In' : 'Register'}
            </button>
        </form>
    </div>
{/if}

<style>
    .loading {
        text-align: center;
        padding: 4rem;
        color: var(--color-text-muted);
    }

    .lobby {
        text-align: center;
        padding: 2rem;
    }

    .placeholder {
        color: var(--color-text-muted);
        max-width: 400px;
        margin: 1rem auto;
    }

    .logout-btn {
        margin-top: 1rem;
        padding: 8px 20px;
        background: transparent;
        color: var(--color-text-muted);
        border: 1px solid var(--color-border-light);
        border-radius: 4px;
        cursor: pointer;
    }

    .logout-btn:hover {
        color: var(--color-text);
        border-color: var(--color-text);
    }

    .auth-container {
        max-width: 360px;
        margin: 2rem auto;
    }

    h1 {
        text-align: center;
        color: var(--color-accent);
    }

    .mode-toggle {
        display: flex;
        gap: 0;
        margin-bottom: 1.5rem;
        border: 1px solid var(--color-border-light);
        border-radius: 4px;
        overflow: hidden;
    }

    .mode-toggle button {
        flex: 1;
        padding: 8px;
        background: transparent;
        color: var(--color-text-muted);
        border: none;
        cursor: pointer;
        font-size: 0.9rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .mode-toggle button.active {
        background: var(--color-bg-panel);
        color: var(--color-accent);
    }

    form {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    label {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: 0.85rem;
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    input {
        padding: 10px 12px;
        background: var(--color-bg-panel);
        border: 1px solid var(--color-border-light);
        border-radius: 4px;
        color: var(--color-text);
        font-size: 1rem;
        text-transform: none;
        letter-spacing: normal;
    }

    input:focus {
        outline: none;
        border-color: var(--color-accent);
    }

    form button[type="submit"] {
        padding: 10px;
        background: var(--color-link);
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 1rem;
        font-weight: 600;
        margin-top: 0.5rem;
    }

    form button[type="submit"]:hover {
        background: #2980b9;
    }

    form button[type="submit"]:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .error {
        color: var(--color-error);
        margin: 0;
        font-size: 0.9rem;
    }
</style>
