"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Player = {
  player_id: string | number;
  name: string;
  team: string;
  role: string;
  player_photo_url: string | null;
  team_logo_url: string | null;
  minutes: number | null;
  goals: number | null;
  assists: number | null;
  tackles: number | null;
  interceptions: number | null;
  saves: number | null;
};

type Group = "GK" | "DEF" | "MID" | "ATT";
type Slot = { id: string; group: Group };

const COLUMNS =
  "player_id, name, team, role, player_photo_url, team_logo_url, minutes, goals, assists, tackles, interceptions, saves";

// Which of your pipeline roles can fill which slot
const GROUP_ROLES: Record<Group, string[]> = {
  GK: ["GK"],
  DEF: ["CB", "FB"],
  MID: ["DM", "CM", "AM"],
  ATT: ["W", "ST"],
};

const GROUP_LABEL: Record<Group, string> = {
  GK: "Goalkeeper",
  DEF: "Defender",
  MID: "Midfielder",
  ATT: "Attacker",
};

// defenders - midfielders - attackers (plus 1 goalkeeper = 6 players)
const FORMATIONS: Record<string, [number, number, number]> = {
  "2-2-1": [2, 2, 1],
  "2-1-2": [2, 1, 2],
  "1-2-2": [1, 2, 2],
  "3-1-1": [3, 1, 1],
  "1-3-1": [1, 3, 1],
};

const DEFAULT_FORMATION = "2-2-1";

function buildSlots(formation: string): Slot[] {
  const [d, m, a] = FORMATIONS[formation] ?? FORMATIONS[DEFAULT_FORMATION];
  const slots: Slot[] = [{ id: "GK-0", group: "GK" }];
  for (let i = 0; i < d; i++) slots.push({ id: `DEF-${i}`, group: "DEF" });
  for (let i = 0; i < m; i++) slots.push({ id: `MID-${i}`, group: "MID" });
  for (let i = 0; i < a; i++) slots.push({ id: `ATT-${i}`, group: "ATT" });
  return slots;
}

// Lets "Odegaard" match "Ødegaard", "Jose" match "José", etc.
function normalize(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function Photo({
  src,
  alt,
  className,
}: {
  src: string | null;
  alt: string;
  className: string;
}) {
  if (!src) return <div className={`${className} bg-surface2`} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={`${className} bg-surface2 object-cover`} />;
}

function SlotCard({
  slot,
  player,
  onOpen,
  onRemove,
}: {
  slot: Slot;
  player: Player | undefined;
  onOpen: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="relative flex w-24 flex-col items-center text-center sm:w-28">
      <button
        type="button"
        onClick={onOpen}
        className="group flex max-w-full flex-col items-center"
      >
        {player ? (
          <Photo
            src={player.player_photo_url}
            alt={player.name}
            className="h-16 w-16 rounded-full border-2 border-gold sm:h-20 sm:w-20"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-white/60 text-2xl text-white/80 group-hover:border-gold group-hover:text-gold sm:h-20 sm:w-20">
            +
          </div>
        )}
        <span className="mt-1.5 max-w-full truncate rounded bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">
          {player ? player.name : GROUP_LABEL[slot.group]}
        </span>
        {player && (
          <span className="mt-0.5 max-w-full truncate text-[10px] text-white/80">
            {player.role} · {player.team}
          </span>
        )}
      </button>
      {player && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${player.name}`}
          className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-xs text-white hover:bg-red"
        >
          ×
        </button>
      )}
    </div>
  );
}

export default function PickYourSix() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formation, setFormation] = useState(DEFAULT_FORMATION);
  const [picks, setPicks] = useState<Record<string, Player>>({});
  const [activeSlot, setActiveSlot] = useState<Slot | null>(null);
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);

  const slots = useMemo(() => buildSlots(formation), [formation]);

  // Load players once, then restore a shared six from the link if there is one
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("players")
        .select(COLUMNS)
        .not("role", "is", null)
        .order("minutes", { ascending: false })
        .limit(1000);

      if (cancelled) return;
      if (error) {
        setLoadError(error.message);
        return;
      }

      const list = (data ?? []) as unknown as Player[];
      setPlayers(list);

      const params = new URLSearchParams(window.location.search);
      const f = params.get("f");
      const startFormation = f && FORMATIONS[f] ? f : DEFAULT_FORMATION;

      const restored: Record<string, Player> = {};
      for (const slot of buildSlots(startFormation)) {
        const id = params.get(slot.id);
        if (!id) continue;
        const p = list.find((x) => String(x.player_id) === id);
        if (p && GROUP_ROLES[slot.group].includes(p.role)) restored[slot.id] = p;
      }

      setFormation(startFormation);
      setPicks(restored);
      setLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the address bar in sync, so "Copy link" always shares the current six
  useEffect(() => {
    if (!loaded) return;
    const params = new URLSearchParams();
    params.set("f", formation);
    for (const slot of slots) {
      const p = picks[slot.id];
      if (p) params.set(slot.id, String(p.player_id));
    }
    window.history.replaceState(null, "", `?${params.toString()}`);
  }, [picks, formation, slots, loaded]);

  const candidates = useMemo(() => {
    if (!activeSlot) return [];
    const roles = GROUP_ROLES[activeSlot.group];
    const taken = new Set(
      slots
        .filter((s) => s.id !== activeSlot.id && picks[s.id])
        .map((s) => String(picks[s.id].player_id))
    );
    const q = normalize(query.trim());
    return players
      .filter(
        (p) =>
          roles.includes(p.role) &&
          !taken.has(String(p.player_id)) &&
          (!q || normalize(p.name).includes(q) || normalize(p.team).includes(q))
      )
      .slice(0, 40);
  }, [activeSlot, players, slots, picks, query]);

  function openSlot(slot: Slot) {
    setQuery("");
    setActiveSlot(slot);
  }

  function pickPlayer(p: Player) {
    if (!activeSlot) return;
    setPicks((prev) => ({ ...prev, [activeSlot.id]: p }));
    setActiveSlot(null);
  }

  function removePick(slotId: string) {
    setPicks((prev) => {
      const next = { ...prev };
      delete next[slotId];
      return next;
    });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked: the link is still in the address bar
    }
  }

  const chosen = slots.map((s) => picks[s.id]).filter(Boolean) as Player[];
  const total = (f: (p: Player) => number | null) =>
    chosen.reduce((sum, p) => sum + (f(p) ?? 0), 0);

  const rows: Group[] = ["ATT", "MID", "DEF", "GK"];

  if (loadError) {
    return <p className="p-8 text-red">Failed to load players: {loadError}</p>;
  }

  return (
    <main className="min-h-screen bg-bg text-text">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Link href="/" className="text-sm text-text-dim hover:text-text">
          ← Leaderboard
        </Link>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight">Pick Your Six</h1>
        <p className="mt-1 text-sm text-text-dim">
          One keeper and five outfield players from the 24/25 Premier League.
          Choose a formation, tap a slot, and pick your player. Only players with
          900+ minutes are in the pool.
        </p>

        {/* Formation */}
        <div className="mt-5">
          <p className="mb-2 text-xs uppercase tracking-wide text-text-dim">
            Formation
          </p>
          <div className="flex flex-wrap gap-2">
            {Object.keys(FORMATIONS).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFormation(f)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                  f === formation
                    ? "bg-blue text-white"
                    : "bg-surface2 text-text-dim hover:bg-surface2/70"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Pitch */}
        <div
          className="relative mt-6 overflow-hidden rounded-2xl border border-border"
          style={{
            background:
              "repeating-linear-gradient(180deg, #14532d 0px, #14532d 70px, #166534 70px, #166534 140px)",
          }}
        >
          <div className="pointer-events-none absolute inset-3 rounded-lg border-2 border-white/25" />
          <div className="pointer-events-none absolute left-3 right-3 top-1/2 h-0.5 -translate-y-1/2 bg-white/25" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/25" />

          <div className="relative flex min-h-[620px] flex-col justify-between px-4 py-10">
            {rows.map((group) => (
              <div key={group} className="flex justify-evenly">
                {slots
                  .filter((s) => s.group === group)
                  .map((slot) => (
                    <SlotCard
                      key={slot.id}
                      slot={slot}
                      player={picks[slot.id]}
                      onOpen={() => openSlot(slot)}
                      onRemove={() => removePick(slot.id)}
                    />
                  ))}
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={copyLink}
            disabled={chosen.length === 0}
            className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-bg hover:bg-gold/90 disabled:opacity-40"
          >
            {copied ? "Link copied!" : "Copy link to my six"}
          </button>
          {chosen.length > 0 && (
            <button
              type="button"
              onClick={() => setPicks({})}
              className="text-sm text-text-dim hover:text-text"
            >
              Clear all
            </button>
          )}
          <span className="text-sm text-text-dim">{chosen.length} / 6 picked</span>
        </div>

        {/* Squad totals */}
        {chosen.length > 0 && (
          <div className="mt-6">
            <p className="mb-2 text-xs uppercase tracking-wide text-text-dim">
              Your six, season totals
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Goals", value: total((p) => p.goals) },
                { label: "Assists", value: total((p) => p.assists) },
                {
                  label: "Tackles + interceptions",
                  value: total((p) => p.tackles) + total((p) => p.interceptions),
                },
                { label: "Saves", value: total((p) => p.saves) },
              ].map((t) => (
                <div
                  key={t.label}
                  className="rounded-xl border border-border bg-surface px-4 py-3"
                >
                  <div className="text-2xl font-extrabold tabular-nums text-gold">
                    {t.value}
                  </div>
                  <div className="text-xs text-text-dim">{t.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Player picker */}
      {activeSlot && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
          onClick={() => setActiveSlot(null)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl border border-border bg-surface p-4 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">
                Pick a {GROUP_LABEL[activeSlot.group].toLowerCase()}
              </h2>
              <button
                type="button"
                onClick={() => setActiveSlot(null)}
                className="text-sm text-text-dim hover:text-text"
              >
                Close
              </button>
            </div>

            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by player or team"
              className="mt-3 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-dim"
            />

            <div className="mt-3 max-h-80 overflow-y-auto">
              {!loaded && <p className="py-6 text-center text-sm text-text-dim">Loading players…</p>}
              {loaded && candidates.length === 0 && (
                <p className="py-6 text-center text-sm text-text-dim">
                  No players match.
                </p>
              )}
              <ul className="divide-y divide-border">
                {candidates.map((p) => (
                  <li key={p.player_id}>
                    <button
                      type="button"
                      onClick={() => pickPlayer(p)}
                      className="flex w-full items-center gap-3 px-1 py-2 text-left hover:bg-surface2/60"
                    >
                      <Photo
                        src={p.player_photo_url}
                        alt={p.name}
                        className="h-10 w-10 shrink-0 rounded-full"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{p.name}</div>
                        <div className="truncate text-xs text-text-dim">{p.team}</div>
                      </div>
                      <span className="rounded bg-surface2 px-2 py-0.5 text-xs font-medium">
                        {p.role}
                      </span>
                      <span className="w-12 text-right text-xs tabular-nums text-text-dim">
                        {p.minutes ?? "-"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <p className="mt-2 text-[11px] text-text-dim">
              Sorted by minutes played. Showing up to 40 matches.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}