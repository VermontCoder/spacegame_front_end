import { env } from '$env/dynamic/public';

export async function load({ params, fetch }) {
    const gameId = params.id;

    try {
        const res = await fetch(`${env.FAST_API_URL}/games/${gameId}/map`);
        if (!res.ok) {
            return { gameId, mapData: null, error: `Failed to load map: ${res.status}` };
        }
        const mapData = await res.json();
        return { gameId, mapData, error: null };
    } catch (e) {
        return { gameId, mapData: null, error: 'Failed to connect to server' };
    }
}
