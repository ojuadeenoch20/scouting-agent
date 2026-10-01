// Raw per-90 stats used to measure "how similar are these two players",
// same feature sets as find_similar.py. Percentile columns are for DISPLAY
// (profile bars); these raw stats are for the similarity math itself.
export const ROLE_FEATURES: Record<string, string[]> = {
  CB: ["tackles_p90", "interceptions_p90", "blocks_p90", "duels_won_p90", "passes_total_p90", "fouls_committed_p90"],
  FB: ["tackles_p90", "interceptions_p90", "dribbles_attempts_p90", "passes_key_p90", "duels_won_p90", "fouls_committed_p90"],
  DM: ["tackles_p90", "interceptions_p90", "passes_total_p90", "duels_won_p90", "fouls_committed_p90"],
  CM: ["tackles_p90", "passes_key_p90", "dribbles_attempts_p90", "shots_total_p90", "goals_p90"],
  AM: ["passes_key_p90", "dribbles_attempts_p90", "shots_total_p90", "goals_p90", "assists_p90"],
  W: ["dribbles_attempts_p90", "passes_key_p90", "shots_total_p90", "goals_p90", "assists_p90"],
  ST: ["goals_p90", "shots_total_p90", "shot_accuracy_pct", "passes_key_p90", "dribbles_attempts_p90"],
  GK: ["saves_p90", "goals_conceded_p90", "passes_total_p90"],
};

// Percentile columns to show as profile bars - same idea, different columns
export const PROFILE_STATS: Record<string, { key: string; label: string }[]> = {
  CB: [
    { key: "tackles_p90_pct", label: "Tackles / 90" },
    { key: "interceptions_p90_pct", label: "Interceptions / 90" },
    { key: "blocks_p90_pct", label: "Blocks / 90" },
    { key: "duels_won_p90_pct", label: "Duels won / 90" },
    { key: "passes_total_p90_pct", label: "Passes / 90" },
  ],
  FB: [
    { key: "tackles_p90_pct", label: "Tackles / 90" },
    { key: "interceptions_p90_pct", label: "Interceptions / 90" },
    { key: "dribbles_attempts_p90_pct", label: "Dribbles / 90" },
    { key: "passes_key_p90_pct", label: "Key passes / 90" },
    { key: "duels_won_p90_pct", label: "Duels won / 90" },
  ],
  DM: [
    { key: "tackles_p90_pct", label: "Tackles / 90" },
    { key: "interceptions_p90_pct", label: "Interceptions / 90" },
    { key: "passes_total_p90_pct", label: "Passes / 90" },
    { key: "duels_won_p90_pct", label: "Duels won / 90" },
  ],
  CM: [
    { key: "tackles_p90_pct", label: "Tackles / 90" },
    { key: "passes_key_p90_pct", label: "Key passes / 90" },
    { key: "dribbles_attempts_p90_pct", label: "Dribbles / 90" },
    { key: "goals_p90_pct", label: "Goals / 90" },
  ],
  AM: [
    { key: "passes_key_p90_pct", label: "Key passes / 90" },
    { key: "dribbles_attempts_p90_pct", label: "Dribbles / 90" },
    { key: "goals_p90_pct", label: "Goals / 90" },
    { key: "assists_p90_pct", label: "Assists / 90" },
  ],
  W: [
    { key: "dribbles_attempts_p90_pct", label: "Dribbles / 90" },
    { key: "passes_key_p90_pct", label: "Key passes / 90" },
    { key: "goals_p90_pct", label: "Goals / 90" },
    { key: "assists_p90_pct", label: "Assists / 90" },
  ],
  ST: [
    { key: "goals_p90_pct", label: "Goals / 90" },
    { key: "shots_total_p90_pct", label: "Shots / 90" },
    { key: "shot_accuracy_pct_pct", label: "Shot accuracy" },
    { key: "dribbles_attempts_p90_pct", label: "Dribbles / 90" },
  ],
  GK: [
    { key: "saves_p90_pct", label: "Saves / 90" },
    { key: "goals_conceded_p90_pct", label: "Goals conceded / 90 (lower is better)" },
    { key: "penalties_saved_p90_pct", label: "Penalties saved / 90" },
    { key: "passes_total_p90_pct", label: "Passes / 90" },
  ],
};

type PlayerRow = Record<string, string | number | null>;

export function findSimilarPlayers(
  target: PlayerRow,
  pool: PlayerRow[],
  n = 5
): (PlayerRow & { distance: number })[] {
  const role = target.role as string;
  const features = ROLE_FEATURES[role] ?? [];
  if (features.length === 0) return [];

  // z-score standardize each feature across the pool (same role only)
  const stats = features.map((f) => {
    const values = pool.map((p) => Number(p[f]) || 0);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    const std = Math.sqrt(variance) || 1; // avoid divide-by-zero
    return { key: f, mean, std };
  });

  const vector = (p: PlayerRow) =>
    stats.map((s) => ((Number(p[s.key]) || 0) - s.mean) / s.std);

  const targetVec = vector(target);

  return pool
    .filter((p) => p.player_id !== target.player_id)
    .map((p) => {
      const v = vector(p);
      const distance = Math.sqrt(
        v.reduce((sum, val, i) => sum + (val - targetVec[i]) ** 2, 0)
      );
      return { ...p, distance };
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, n);
}