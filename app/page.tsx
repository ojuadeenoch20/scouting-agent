import { createClient } from "@supabase/supabase-js";
import Link from "next/link";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const revalidate = 3600;

type Player = {
  player_id: string | number;
  name: string;
  team: string;
  role: string;
  player_photo_url: string | null;
  team_logo_url: string | null;
  appearances: number | null;
  minutes: number | null;
  goals: number | null;
  assists: number | null;
  [key: string]: string | number | null;
};

type Stat = { key: string; label: string; kind: "count" | "rate" | "pct" };

const GROUPS: { title: string; stats: Stat[] }[] = [
  {
    title: "General",
    stats: [
      { key: "minutes", label: "Minutes", kind: "count" },
      { key: "appearances", label: "Appearances", kind: "count" },
    ],
  },
  {
    title: "Attacking",
    stats: [
      { key: "goals", label: "Goals", kind: "count" },
      { key: "assists", label: "Assists", kind: "count" },
      { key: "goals_p90", label: "Goals / 90", kind: "rate" },
      { key: "assists_p90", label: "Assists / 90", kind: "rate" },
      { key: "shots_total", label: "Shots", kind: "count" },
      { key: "shots_total_p90", label: "Shots / 90", kind: "rate" },
      { key: "shots_on_target", label: "Shots on target", kind: "count" },
      { key: "shots_on_target_p90", label: "On target / 90", kind: "rate" },
      { key: "shot_accuracy_pct", label: "Shot accuracy %", kind: "pct" },
      { key: "penalties_scored", label: "Penalties scored", kind: "count" },
    ],
  },
  {
    title: "Passing",
    stats: [
      { key: "passes_total", label: "Passes", kind: "count" },
      { key: "passes_total_p90", label: "Passes / 90", kind: "rate" },
      { key: "passes_key", label: "Key passes", kind: "count" },
      { key: "passes_key_p90", label: "Key passes / 90", kind: "rate" },
    ],
  },
  {
    title: "Defending",
    stats: [
      { key: "tackles", label: "Tackles", kind: "count" },
      { key: "tackles_p90", label: "Tackles / 90", kind: "rate" },
      { key: "interceptions", label: "Interceptions", kind: "count" },
      { key: "interceptions_p90", label: "Interceptions / 90", kind: "rate" },
      { key: "blocks", label: "Blocks", kind: "count" },
      { key: "blocks_p90", label: "Blocks / 90", kind: "rate" },
    ],
  },
  {
    title: "Duels & dribbling",
    stats: [
      { key: "duels_won", label: "Duels won", kind: "count" },
      { key: "duels_won_p90", label: "Duels won / 90", kind: "rate" },
      { key: "duel_win_pct", label: "Duel win %", kind: "pct" },
      { key: "dribbles_success", label: "Dribbles won", kind: "count" },
      { key: "dribbles_success_p90", label: "Dribbles won / 90", kind: "rate" },
      { key: "dribble_success_pct", label: "Dribble success %", kind: "pct" },
      { key: "fouls_drawn_p90", label: "Fouls drawn / 90", kind: "rate" },
    ],
  },
  {
    title: "Goalkeeping",
    stats: [
      { key: "saves", label: "Saves", kind: "count" },
      { key: "saves_p90", label: "Saves / 90", kind: "rate" },
      { key: "goals_conceded", label: "Goals conceded", kind: "count" },
      { key: "penalties_saved", label: "Penalties saved", kind: "count" },
    ],
  },
  {
    title: "Discipline",
    stats: [
      { key: "fouls_committed_p90", label: "Fouls / 90", kind: "rate" },
      { key: "yellow_cards", label: "Yellow cards", kind: "count" },
      { key: "red_cards", label: "Red cards", kind: "count" },
    ],
  },
];

const STATS: Stat[] = GROUPS.flatMap((g) => g.stats);

// Fine-grained roles from the clustering/hand-labeling pipeline - NOT the
// broad 4-group "position" column. This is the whole point of that work:
// comparing a CB to other CBs, not to every Defender.
const ROLES = ["All", "GK", "CB", "FB", "DM", "CM", "AM", "W", "ST"];
const MIN_MINUTES_FOR_RATES = 900;

function buildHref(p: { role?: string; team?: string; sort?: string }) {
  const params = new URLSearchParams();
  if (p.role) params.set("role", p.role);
  if (p.team) params.set("team", p.team);
  if (p.sort && p.sort !== "minutes") params.set("sort", p.sort);
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}

function formatValue(value: number | null, kind: Stat["kind"]) {
  if (value === null || value === undefined) return "-";
  if (kind === "rate") return Number(value).toFixed(2);
  if (kind === "pct") return `${Number(value).toFixed(1)}%`;
  return String(value);
}

export default async function Leaderboard({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; team?: string; sort?: string }>;
}) {
  const { role, team, sort } = await searchParams;

  // Only allow sorting by columns we listed (safe whitelist)
  const stat = STATS.find((s) => s.key === sort) ?? STATS[0];

  // Team list for the dropdown
  const { data: teamRows } = await supabase.from("players").select("team");
  const teams = Array.from(new Set((teamRows ?? []).map((r) => r.team)))
    .filter(Boolean)
    .sort();

  // Player query
  let query = supabase
    .from("players")
    .select("*")
    .order(stat.key, { ascending: false, nullsFirst: false })
    .limit(50);

  if (role) query = query.eq("role", role);
  if (team) query = query.eq("team", team);
  if (stat.kind !== "count") query = query.gte("minutes", MIN_MINUTES_FOR_RATES);

  const { data, error } = await query;
  const players = (data ?? []) as Player[];

  if (error) {
    return <p className="p-8 text-red">{JSON.stringify(error)}</p>;
  }

  const max = Number(players[0]?.[stat.key] ?? 1) || 1;

  return (
    <main className="min-h-screen bg-bg text-text">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-3xl font-extrabold tracking-tight">Player Leaderboard</h1>
        <p className="mt-1 text-sm text-text-dim">
          Top 50 by {stat.label.toLowerCase()}
          {stat.kind !== "count" &&
            ` (minimum ${MIN_MINUTES_FOR_RATES} minutes played)`}
        </p>

        {/* Rank by, grouped */}
        <div className="mt-5 space-y-3">
          <p className="text-xs uppercase tracking-wide text-text-dim">Rank by</p>
          {GROUPS.map((group) => (
            <div key={group.title}>
              <p className="mb-1.5 text-xs font-medium text-text-dim">
                {group.title}
              </p>
              <div className="flex flex-wrap gap-2">
                {group.stats.map((s) => (
                  <a
                    key={s.key}
                    href={buildHref({ role, team, sort: s.key })}
                    className={`rounded-full px-3 py-1 text-xs ${
                      s.key === stat.key
                        ? "bg-gold font-semibold text-bg"
                        : "bg-surface2 text-text-dim hover:bg-surface2/70"
                    }`}
                  >
                    {s.label}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Role */}
        <div className="mt-6 flex flex-wrap gap-2">
          {ROLES.map((label) => {
            const active = (role ?? "All") === label;
            return (
              <a
                key={label}
                href={buildHref({
                  role: label === "All" ? undefined : label,
                  team,
                  sort: stat.key,
                })}
                className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                  active
                    ? "bg-blue text-white"
                    : "bg-surface2 text-text-dim hover:bg-surface2/70"
                }`}
              >
                {label}
              </a>
            );
          })}
        </div>

        {/* Team */}
        <form
          method="get"
          action="/"
          className="mt-4 flex flex-wrap items-center gap-2"
        >
          {role && <input type="hidden" name="role" value={role} />}
          {stat.key !== "minutes" && (
            <input type="hidden" name="sort" value={stat.key} />
          )}
          <select
            name="team"
            defaultValue={team ?? ""}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text"
          >
            <option value="">All teams</option>
            {teams.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-bg hover:bg-gold/90"
          >
            Apply
          </button>
          {(team || role || stat.key !== "minutes") && (
            <a href="/" className="text-sm text-text-dim hover:text-text">
              Reset
            </a>
          )}
        </form>

        {/* Table */}
        <div className="mt-6 overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs uppercase text-text-dim">
              <tr>
                <th className="w-12 px-4 py-3">#</th>
                <th className="px-4 py-3">Player</th>
                <th className="px-4 py-3">Role</th>
                <th className="hidden px-4 py-3 text-right sm:table-cell">Apps</th>
                <th className="hidden px-4 py-3 text-right sm:table-cell">Mins</th>
                <th className="hidden px-4 py-3 text-right sm:table-cell">G</th>
                <th className="hidden px-4 py-3 text-right sm:table-cell">A</th>
                <th className="px-4 py-3 text-right text-gold">{stat.label}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {players.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-text-dim">
                    No players match these filters.
                  </td>
                </tr>
              )}
              {players.map((p, i) => {
                const value = p[stat.key] as number | null;
                return (
                  <tr key={p.player_id} className="hover:bg-surface/60">
                    <td className="px-4 py-3 text-text-dim">{i + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {p.player_photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.player_photo_url}
                            alt={p.name}
                            className="h-9 w-9 rounded-full bg-surface2 object-cover"
                          />
                        ) : (
                          <div className="h-9 w-9 rounded-full bg-surface2" />
                        )}
                        <div>
                          <Link
                            href={`/players/${p.player_id}`}
                            className="font-medium hover:text-gold"
                          >
                            {p.name}
                          </Link>
                          <div className="flex items-center gap-1.5 text-xs text-text-dim">
                            {p.team_logo_url && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={p.team_logo_url}
                                alt=""
                                className="h-3.5 w-3.5 object-contain"
                              />
                            )}
                            {p.team}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-surface2 px-2 py-0.5 text-xs font-medium">
                        {p.role}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-right tabular-nums text-text-dim sm:table-cell">
                      {p.appearances ?? "-"}
                    </td>
                    <td className="hidden px-4 py-3 text-right tabular-nums text-text-dim sm:table-cell">
                      {p.minutes ?? "-"}
                    </td>
                    <td className="hidden px-4 py-3 text-right tabular-nums text-text-dim sm:table-cell">
                      {p.goals ?? "-"}
                    </td>
                    <td className="hidden px-4 py-3 text-right tabular-nums text-text-dim sm:table-cell">
                      {p.assists ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="ml-auto h-1.5 w-24 rounded bg-surface2">
                        <div
                          className="h-1.5 rounded bg-gold"
                          style={{
                            width: `${Math.max(
                              0,
                              Math.min(100, ((value ?? 0) / max) * 100)
                            )}%`,
                          }}
                        />
                      </div>
                      <span className="mt-1 block font-semibold tabular-nums">
                        {formatValue(value, stat.kind)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}