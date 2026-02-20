<script>
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { isAuthenticated, getUser, logout as authLogout, isLoading } from "$lib/auth.svelte.js";

  let authenticated = $derived(isAuthenticated());
  let user = $derived(getUser());
  let authLoading = $derived(isLoading());

  function handleLogout() {
    authLogout();
    goto('/');
  }
</script>

<header>
  {#if !authLoading && authenticated}
    <nav>
      <ul>
        <li aria-current={$page.url.pathname === "/" ? "page" : undefined}>
          <a href="/">Lobby</a>
        </li>
      </ul>
    </nav>
    <div class="user-info">
      <span class="username">{user?.username}</span>
      <button class="logout-btn" onclick={handleLogout}>Log Out</button>
    </div>
  {/if}
</header>

<style>
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: rgba(15, 15, 35, 0.85);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid rgba(139, 92, 246, 0.20);
    padding: 0 1rem;
  }

  nav {
    display: flex;
    justify-content: center;
    --background: var(--color-bg-panel);
  }

  ul {
    position: relative;
    padding: 0;
    margin: 0;
    height: 3em;
    display: flex;
    justify-content: center;
    align-items: center;
    list-style: none;
    background: var(--background);
    background-size: contain;
  }

  li {
    position: relative;
    height: 100%;
  }

  li[aria-current="page"]::before {
    --size: 6px;
    content: "";
    width: 0;
    height: 0;
    position: absolute;
    top: 0;
    left: calc(50% - var(--size));
    border: var(--size) solid transparent;
    border-top: var(--size) solid var(--color-accent);
  }

  nav a {
    display: flex;
    height: 100%;
    align-items: center;
    padding: 0 0.5rem;
    color: var(--color-text-muted);
    font-family: var(--font-ui);
    font-weight: 600;
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    text-decoration: none;
    transition: color 0.2s linear;
  }

  a:hover {
    color: var(--color-accent);
  }

  .user-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding-right: 0.5rem;
  }

  .username {
    color: var(--color-text-muted);
    font-family: var(--font-ui);
    font-size: 0.95rem;
    font-weight: 500;
    letter-spacing: 0.04em;
  }

  .logout-btn {
    padding: 4px 14px;
    background: transparent;
    color: var(--color-text-muted);
    border: 1px solid var(--color-border);
    border-radius: 50px;
    cursor: pointer;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .logout-btn:hover {
    color: var(--color-accent);
    border-color: var(--color-accent);
  }
</style>
