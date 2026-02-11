<script>
  import { onMount } from 'svelte';
  import { env } from '$env/dynamic/public';

  let users = $state([]);
  let error = $state('');

  onMount(async () => {
    try {
      const res = await fetch(`${env.FAST_API_URL}/users`);
      users = await res.json();
    } catch (e) {
      error = 'Failed to fetch users';
    }
  });
</script>

<h1>Users</h1>

{#if error}
  <p style="color: red;">{error}</p>
{:else if users.length === 0}
  <p>Loading...</p>
{:else}
  <table>
    <thead>
      <tr>
        <th>User ID</th>
        <th>Username</th>
        <th>First Name</th>
        <th>Last Name</th>
        <th>Email</th>
      </tr>
    </thead>
    <tbody>
      {#each users as user}
        <tr>
          <td>{user.user_id}</td>
          <td>{user.username}</td>
          <td>{user.first_name}</td>
          <td>{user.last_name}</td>
          <td>{user.email}</td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}

<style>
  table {
    border-collapse: collapse;
    width: 100%;
    max-width: 800px;
  }
  th, td {
    border: 1px solid #ccc;
    padding: 8px 12px;
    text-align: left;
  }
  th {
    background-color: #f0f0f0;
    font-weight: bold;
  }
  tr:nth-child(even) {
    background-color: #fafafa;
  }
</style>
