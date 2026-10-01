import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { notFound } from "next/navigation";
import { findSimilarPlayers, PROFILE_STATS } from "@/lib/similarity";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function barColor(pct: number) {
  if (pct >= 80) return "bg-gold";
  if (pct >= 50) return "bg-blue";
  return "bg-red";
}

export default async function PlayerProfile({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: player } = await supabase
    .from("players")
    .select("*")
    .eq("player_id", id)
    .single();

  if (!player) notFound();

  // Pull the whole role group once - small enough (under ~120 players) to
  // standardize and compare in the request itself, no precompute needed.
  const { data: pool } = await supabase
    .from("players")
    .select("*")
    .eq("role", player.role);

  const similar = findSimilarPlayers(player, pool ?? [], 5);
  const profileStats = PROFILE_STATS[player.role] ?? [];

  return (
    <main className="min-h-screen bg-bg text-text">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Link href="/" className="text-sm text-text-dim hover:text-text">
          ← Back to leaderboard
        </Link>

        {/* Header */}
        <div className="mt-4 flex items-center gap-4">
          {player.player_photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={player.player_photo_url}
              alt={player.name}
              className="h-20 w-20 rounded-full bg-surface2 object-cover"
            />
          ) : (
            <div className="h-20 w-20 rounded-full bg-surface2" />
          )}
          <div>
            <h1 className="text-2xl font-extrabold">{player.name}</h1>
            <div className="mt-1 flex items-center gap-2 text-sm text-text-dim">
              {player.team_logo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={player.team_logo_url} alt="" className="h-4 w-4 object-contain" />
              )}
              {player.team} · <span className="rounded bg-surface2 px-2 py-0.5 text-xs font-medium">{player.role}</span>
              {player.low_sample && (
                <span className="rounded bg-red/20 px-2 py-0.5 text-xs text-red">Low sample</span>
              )}
            </div>
            <p className="mt-1 text-sm text-text-dim">
              {player.minutes} min · {player.goals ?? 0} goals · {player.assists ?? 0} assists
            </p>
          </div>
        </div>

        {/* Percentile bars */}
        <section className="mt-8">
          <h2 className="text-xs uppercase tracking-wide text-text-dim">
            Percentile among {player.role}s (Premier League 2024/25)
          </h2>
          <div className="mt-3 space-y-3">
            {profileStats.map((s) => {
              const pct = Number(player[s.key]) || 0;
              return (
                <div key={s.key}>
                  <div className="flex justify-between text-sm">
                    <span className="text-text-dim">{s.label}</span>
                    <span className="font-semibold">{pct.toFixed(0)}</span>
                  </div>
                  <div className="mt-1 h-2 rounded bg-surface2">
                    <div
                      className={`h-2 rounded ${barColor(pct)}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Similar players */}
        <section className="mt-10">
          <h2 className="text-xs uppercase tracking-wide text-text-dim">
            Similar {player.role}s
          </h2>
          <div className="mt-3 space-y-2">
            {similar.map((p) => (
              <Link
                key={p.player_id as string}
                href={`/players/${p.player_id}`}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3 hover:bg-surface/60"
              >
                {p.player_photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.player_photo_url as string}
                    alt=""
                    className="h-9 w-9 rounded-full bg-surface2 object-cover"
                  />
                ) : (
                  <div className="h-9 w-9 rounded-full bg-surface2" />
                )}
                <div className="flex-1">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-text-dim">{p.team} · {p.minutes} min</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}