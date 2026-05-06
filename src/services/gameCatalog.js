const fallbackGames = [
  {
    id: 'lucky-spin',
    title: 'Lucky Spin',
    short_description: 'Spin the neon wheel and chase instant NXT rewards.',
    thumbnail: '/game-images/lucky-spin.svg',
    genre: 'Quick Win',
    game_url: 'https://www.freetogame.com',
    icon: '🎡'
  },
  {
    id: 'trivia-rush',
    title: 'Trivia Rush',
    short_description: 'Answer fast, stack points, climb the leaderboard.',
    thumbnail: '/game-images/trivia-rush.svg',
    genre: 'Skill',
    game_url: 'https://www.freetogame.com',
    icon: '❓'
  },
  {
    id: 'arcade-blitz',
    title: 'Arcade Blitz',
    short_description: 'A quick reflex challenge built for repeat plays.',
    thumbnail: '/game-images/arcade-blitz.svg',
    genre: 'Arcade',
    game_url: 'https://www.freetogame.com',
    icon: '🎯'
  },
  {
    id: 'prediction-zone',
    title: 'Prediction Zone',
    short_description: 'Make smart calls and build your streak score.',
    thumbnail: '/game-images/prediction-zone.svg',
    genre: 'Skill',
    game_url: 'https://www.freetogame.com',
    icon: '📈'
  }
];

const fees = [5, 10, 20, 50];
const categories = ['Arcade', 'Skill', 'Quick Win'];

function toGame(raw, index) {
  const genre = categories[index % categories.length];
  return {
    id: String(raw.id ?? raw.title ?? raw.name ?? `game-${index}`).toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    title: raw.title ?? raw.name ?? `Game ${index + 1}`,
    description: raw.short_description ?? raw.description ?? 'Fast match. Big score. Instant leaderboard energy.',
    image: raw.thumbnail ?? '',
    category: raw.genre && raw.genre.length < 18 ? raw.genre : genre,
    entryFees: [fees[index % fees.length], fees[(index + 1) % fees.length], fees[(index + 2) % fees.length]],
    playersOnline: 80 + ((index * 37) % 260),
    bestScoreToday: 1200 + ((index * 719) % 9000),
    apiUrl: raw.game_url ?? '',
    icon: raw.icon ?? ['🎮', '⚡', '🎯', '🎡', '🏆'][index % 5]
  };
}

export async function fetchGameCatalog(apiUrl) {
  const localGames = fallbackGames.map(toGame);

  try {
    const response = await fetch(apiUrl, { signal: AbortSignal.timeout(3500) });
    if (!response.ok) throw new Error(`Game API returned ${response.status}`);
    const data = await response.json();
    const list = Array.isArray(data) ? data.slice(0, 12) : fallbackGames;
    const localIds = new Set(localGames.map((game) => game.id));
    const liveGames = list.map(toGame).filter((game) => !localIds.has(game.id));
    return { source: 'api', games: [...localGames, ...liveGames] };
  } catch (error) {
    return { source: 'fallback', games: localGames, error: error.message };
  }
}
