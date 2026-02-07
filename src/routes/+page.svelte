<script>
  import { env } from '$env/dynamic/public';

  let result = $state('');

  async function fetchRandom() {
    const res = await fetch(`${env.PUBLIC_API_URL}/random`);
    const data = await res.json();
    result = data.number;
  }
</script>

<h1>Welcome to Basic Check</h1>

<button onclick={fetchRandom}>Get Random Number</button>

{#if result !== ''}
  <p>Random number: {result}</p>
{/if}
