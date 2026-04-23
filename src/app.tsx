import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * SLOTS Solitaire (mobile-first) — single-file React prototype (NO Tailwind required)
 *
 * Assets expected in: /public/assets/
 *   crown.png, diamond.png, present.png, seven.png, bar.png, cherry.png, jewel.png, bomb.png
 *   cardback.png, Score.png, splash.png
 */

// --- SOUND EFFECTS ---
const sadTrombone = new Audio("/assets/SadTrombone.mp3");
sadTrombone.volume = 0.6;

function playDealSound() {
  const sound = new Audio("/assets/CardBeingDealt.mp3");
  sound.volume = 0.5;
  sound.play().catch(() => {});
}

function playSadTrombone() {
  sadTrombone.currentTime = 0;
  sadTrombone.play().catch(() => {});
}

function playCoinDrop() {
  const sound = new Audio("/assets/CoinDrop.mp3");
  sound.volume = 0.6;
  sound.play().catch(() => {});
}

const STATS_KEY = "slots_solitaire_stats";
const SPLASH_SRC = "/assets/splash.png";
const SPLASH_MS = 2500;

const STATS_UPLOAD_URL = "https://d2xdybbmnhyevxwjhhb2qkftky0quyjy.lambda-url.us-east-1.on.aws/";
const SESSION_ID_KEY = "slots_session_id";

function getSessionId(): string {
  try {
    let id = localStorage.getItem(SESSION_ID_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : "fallback_" + Date.now() + "_" + Math.random().toString(16).slice(2);
      localStorage.setItem(SESSION_ID_KEY, id);
    }
    return id;
  } catch {
    return "fallback_" + Date.now();
  }
}

async function uploadGameStats(plays: number, highScore: number, averageScore: number) {
    try {
        const response = await fetch("https://d2xdybbmnhyevxwjhhb2qkftky0quyjy.lambda-url.us-east-1.on.aws/", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                plays: plays,
                highScore: highScore,
                averageScore: averageScore,
                sessionId: getSessionId()
            })
        });

        const text = await response.text();
        console.log("🔥 Lambda response:", response.status, text);

    } catch (err) {
        console.error("❌ Upload failed:", err);
    }
}

type GameStats = {
  plays: number;
  highScore: number;
  totalScore: number;
};

function loadStats(): GameStats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return { plays: 0, highScore: 0, totalScore: 0 };
    const parsed = JSON.parse(raw);
    return {
      plays: Number(parsed.plays) || 0,
      highScore: Number(parsed.highScore) || 0,
      totalScore: Number(parsed.totalScore) || 0,
    };
  } catch {
    return { plays: 0, highScore: 0, totalScore: 0 };
  }
}

function saveStats(stats: GameStats) {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

const DRAWS_MAX = 25;
const GRID_SIZE = 9;

// Deck composition (total 80)
const DECK_COUNTS = {
  crown: 8, // wild
  diamond: 8,
  present: 10,
  seven: 12,
  bar: 14,
  cherry: 16,
  jewel: 22, // scores 0 but can be cashed in
  bomb: 2,
} as const;

type SymbolKey = keyof typeof DECK_COUNTS;

type Card = {
  id: string;
  sym: SymbolKey;
};

type LogItem = {
  id: string;
  ts: number;
  text: string;
};

// Scoring values
const PAYOUT: Record<Exclude<SymbolKey, "bomb" | "crown">, number> = {
  diamond: 500,
  present: 400,
  seven: 300,
  bar: 200,
  cherry: 100,
  jewel: 0,
};

const ASSET_MAP: Record<SymbolKey, string> = {
  crown: "/assets/crown.png",
  diamond: "/assets/diamond.png",
  present: "/assets/present.png",
  seven: "/assets/seven.png",
  bar: "/assets/bar.png",
  cherry: "/assets/cherry.png",
  jewel: "/assets/jewel.png",
  bomb: "/assets/bomb.png",
};

// Card back (deck) image shown when no drawn card is pending.
const CARD_BACK_SRC = "/assets/cardback.png";

// Help screen image
const HELP_IMAGE_SRC = "/assets/Score.png";

const LABEL: Record<SymbolKey, string> = {
  crown: "Crown (Wild)",
  diamond: "Diamond",
  present: "Present",
  seven: "7",
  bar: "BAR",
  cherry: "Cherry",
  jewel: "Jewel",
  bomb: "Bomb",
};

// Lines for a 3x3 grid (indices)
const LINES: number[][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function buildDeck(): Card[] {
  const deck: Card[] = [];
  (Object.keys(DECK_COUNTS) as SymbolKey[]).forEach((sym) => {
    for (let i = 0; i < DECK_COUNTS[sym]; i++) deck.push({ id: uid(sym), sym });
  });
  return deck;
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function evaluateLine(cards: Card[]): { ok: boolean; points: number; label: string } {
  if (cards.some((c) => c.sym === "bomb")) return { ok: false, points: 0, label: "Bombs can’t be scored" };

  const syms = cards.map((c) => c.sym);

  // 3 crowns special
  if (syms.every((s) => s === "crown")) return { ok: true, points: 1000, label: "3 Crowns" };

  // Best-possible payout (crowns wild)
  const targets: Exclude<SymbolKey, "bomb" | "crown">[] = ["diamond", "present", "seven", "bar", "cherry", "jewel"];

  let best: { points: number; label: string } | null = null;

  for (const t of targets) {
    const ok = syms.every((s) => s === "crown" || s === t);
    if (!ok) continue;

    const points = PAYOUT[t];
    const label = t === "jewel" ? "3 Jewels (0)" : `3 ${LABEL[t]}${t === "cherry" ? "ies" : "s"}`;
    if (!best || points > best.points) best = { points, label };
  }

  if (!best) return { ok: false, points: 0, label: "Not a matching line" };
  return { ok: true, points: best.points, label: best.label };
}

function clampLog(log: LogItem[], max = 12) {
  if (log.length <= max) return log;
  return log.slice(log.length - max);
}

export default function SlotsSolitaire() {
  const [deck, setDeck] = useState<Card[]>([]);
  const [discard, setDiscard] = useState<Card[]>([]);
  const [grid, setGrid] = useState<(Card | null)[]>(Array(GRID_SIZE).fill(null));
  const [drawn, setDrawn] = useState<Card | null>(null);
  const [drawsUsed, setDrawsUsed] = useState(0);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const [, setLog] = useState<LogItem[]>([]);

  const [bombOverlay, setBombOverlay] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [stats, setStats] = useState<GameStats>({ plays: 0, highScore: 0, totalScore: 0 });
  const [gameRecorded, setGameRecorded] = useState(false);

  const splashTimer = useRef<number | null>(null);
  const bombTimer = useRef<number | null>(null);
  const deckRef = useRef<Card[]>([]);
  const discardRef = useRef<Card[]>([]);

  async function handleShareGame() {
    const gameUrl = window.location.href;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(gameUrl);
        window.alert(
          "A shareable link to the game has been copied. Now simply paste it into a text message, messenger message, or email to share it with your friends."
        );
        return;
      }
    } catch (err) {
      console.error("Clipboard copy failed:", err);
    }

    window.prompt("Copy this link and paste it into a text message or email:", gameUrl);
  }

  function forceGameOver() {
    if (bombOverlay || isSpinning || showSplash) return;
    setDrawn(null);
    setSelected([]);
    setDrawsUsed(DRAWS_MAX);
    pushLog("Forced Game Over for testing.");
  }

  // Dealing animation (slot-style spin)
  const SPIN_MS = 500;
  const SPIN_TICK_MS = 60;
  const SYMBOL_KEYS = useMemo(() => Object.keys(DECK_COUNTS) as SymbolKey[], []);
  const [isSpinning, setIsSpinning] = useState(false);
  const [spinSyms, setSpinSyms] = useState<(SymbolKey | null)[]>(Array(GRID_SIZE).fill(null));
  const spinInterval = useRef<number | null>(null);
  const spinTimeout = useRef<number | null>(null);

  function stopSpinTimers() {
    if (spinInterval.current !== null) {
      window.clearInterval(spinInterval.current);
      spinInterval.current = null;
    }
    if (spinTimeout.current !== null) {
      window.clearTimeout(spinTimeout.current);
      spinTimeout.current = null;
    }
  }

  function randomSym() {
    const keys = SYMBOL_KEYS;
    return keys[Math.floor(Math.random() * keys.length)]!;
  }

  function spinCells(indices: number[], commit: () => void) {
    stopSpinTimers();
    setIsSpinning(true);

    setSpinSyms((prev) => {
      const next = prev.slice();
      for (const i of indices) next[i] = randomSym();
      return next;
    });

    spinInterval.current = window.setInterval(() => {
      setSpinSyms((prev) => {
        const next = prev.slice();
        for (const i of indices) next[i] = randomSym();
        return next;
      });
    }, SPIN_TICK_MS);

    spinTimeout.current = window.setTimeout(() => {
      stopSpinTimers();
      setSpinSyms((prev) => {
        const next = prev.slice();
        for (const i of indices) next[i] = null;
        return next;
      });
      setIsSpinning(false);
      commit();
    }, SPIN_MS);
  }

  const canDraw = drawsUsed < DRAWS_MAX && drawn === null;
  const hasCashSelection = selected.length > 0;
  const canDrawNow = canDraw && !hasCashSelection;
  const boardLocked = bombOverlay || isSpinning || showSplash;

  // Multi-line scoring
  const winningLines = useMemo(() => {
    if (selected.length < 3) return [] as { line: number[]; points: number; label: string }[];
    const sel = new Set(selected);
    const out: { line: number[]; points: number; label: string }[] = [];
    for (const ln of LINES) {
      if (!ln.every((i) => sel.has(i))) continue;
      const cards = ln.map((i) => grid[i]).filter(Boolean) as Card[];
      if (cards.length !== 3) continue;
      const ev = evaluateLine(cards);
      if (!ev.ok) continue;
      out.push({ line: ln, points: ev.points, label: ev.label });
    }
    return out;
  }, [selected, grid]);

  const selectionInfo = useMemo(() => {
    if (selected.length === 0) return { ok: false, points: 0, label: "Select a Win" };
    if (winningLines.length === 0) return { ok: false, points: 0, label: "No winning line selected" };
    const points = winningLines.reduce((sum, w) => sum + w.points, 0);
    const label = winningLines.length === 1 ? winningLines[0].label : `${winningLines.length} wins`;
    return { ok: true, points, label };
  }, [selected.length, winningLines]);

  // All currently available wins still visible on the board.
  const possibleWins = useMemo(() => {
    const out: { line: number[]; points: number; label: string }[] = [];
    for (const ln of LINES) {
      const cards = ln.map((i) => grid[i]).filter(Boolean) as Card[];
      if (cards.length !== 3) continue;
      const ev = evaluateLine(cards);
      if (!ev.ok) continue;
      out.push({ line: ln, points: ev.points, label: ev.label });
    }
    return out;
  }, [grid]);

  function pushLog(text: string) {
    setLog((l) => clampLog([...l, { id: uid("log"), ts: Date.now(), text }], 12));
  }

  function ensureDeckAvailable(curDeck: Card[], curDiscard: Card[]) {
    if (curDeck.length > 0) return { d: curDeck, dc: curDiscard };
    if (curDiscard.length === 0) return { d: curDeck, dc: curDiscard };
    const reshuffled = shuffle(curDiscard);
    return { d: reshuffled, dc: [] as Card[] };
  }

async function uploadGameStats(plays: number, highScore: number, averageScore: number) {
    try {
        await fetch("https://d2xdybbmnhyevxwjhhb2qkftky0quyjy.lambda-url.us-east-1.on.aws/", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                plays: plays,
                highScore: highScore,
                averageScore: averageScore,
                sessionId: localStorage.getItem("slots_session_id") || "unknown"
            })
        });
    } catch (err) {
        console.error("Upload failed:", err);
    }
}

  function takeTop(curDeck: Card[], curDiscard: Card[]) {
    const ensured = ensureDeckAvailable(curDeck, curDiscard);
    const d = ensured.d.slice();
    const dc = ensured.dc.slice();
    const card = d.shift() ?? null;
    return { card, deck: d, discard: dc };
  }

  function dealN(n: number, curDeck: Card[], curDiscard: Card[]) {
    let d = curDeck;
    let dc = curDiscard;
    const out: Card[] = [];
    for (let i = 0; i < n; i++) {
      const t = takeTop(d, dc);
      if (!t.card) break;
      out.push(t.card);
      d = t.deck;
      dc = t.discard;
    }
    return { cards: out, deck: d, discard: dc };
  }

  function beginInitialDeal() {
    const d = shuffle(buildDeck());
    const dealt = dealN(9, d, []);

    setDeck(dealt.deck);
    setDiscard(dealt.discard);
    setDrawn(null);
    setDrawsUsed(0);
    setScore(0);
    setSelected([]);
    setGrid(Array(GRID_SIZE).fill(null));
    setSpinSyms(Array(GRID_SIZE).fill(null));
    setLog([]);
    pushLog("New game started");

    spinCells(Array.from({ length: GRID_SIZE }, (_, i) => i), () => {
      setGrid(dealt.cards);
      if (dealt.cards.some((c) => c.sym === "bomb")) {
        triggerBomb("Bomb appeared on deal");
      }
    });
  }

  function resetGame() {
    if (bombTimer.current) {
      window.clearTimeout(bombTimer.current);
      bombTimer.current = null;
    }
    if (splashTimer.current) {
      window.clearTimeout(splashTimer.current);
      splashTimer.current = null;
    }

    stopSpinTimers();
    setBombOverlay(false);
    setGameRecorded(false);
    setDrawn(null);
    setSelected([]);
    setGrid(Array(GRID_SIZE).fill(null));
    setSpinSyms(Array(GRID_SIZE).fill(null));
    setShowHelp(false);
    setShowSplash(true);

    splashTimer.current = window.setTimeout(() => {
      setShowSplash(false);
      beginInitialDeal();
      splashTimer.current = null;
    }, SPLASH_MS);
  }

  useEffect(() => {
    resetGame();
    return () => {
      stopSpinTimers();
      if (bombTimer.current) {
        window.clearTimeout(bombTimer.current);
        bombTimer.current = null;
      }
      if (splashTimer.current) {
        window.clearTimeout(splashTimer.current);
        splashTimer.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setStats(loadStats());
  }, []);

  useEffect(() => {
    deckRef.current = deck;
  }, [deck]);

  useEffect(() => {
    discardRef.current = discard;
  }, [discard]);

  function triggerBomb(reason: string) {
    playSadTrombone();

    if (bombTimer.current) return;

    setSelected([]);
    setDrawn(null);
    setBombOverlay(true);

    bombTimer.current = window.setTimeout(() => {
      setGrid((g) => {
        const toDiscard = g.filter(Boolean) as Card[];
        setDiscard((dc) => [...dc, ...toDiscard]);
        return Array(GRID_SIZE).fill(null);
      });

      setDeck((curDeck) => {
        queueMicrotask(() => {
          setDiscard((curDiscard) => {
            const ensured = ensureDeckAvailable(curDeck, curDiscard);
            const dealt = dealN(9, ensured.d, ensured.dc);

            setDeck(dealt.deck);
            setDiscard(dealt.discard);
            setBombOverlay(false);

            const all = Array.from({ length: GRID_SIZE }, (_, i) => i);
            spinCells(all, () => {
              setGrid(dealt.cards);
              if (dealt.cards.some((c) => c.sym === "bomb")) {
                queueMicrotask(() => triggerBomb("Bomb appeared on redeal"));
              }
            });

            if (bombTimer.current) {
              window.clearTimeout(bombTimer.current);
              bombTimer.current = null;
            }

            return dealt.discard;
          });
        });
        return curDeck;
      });

      pushLog(`💣 Bomb triggered (${reason}). Board wiped + redealt.`);
    }, 1800);
  }

  function onDraw() {
    if (boardLocked) return;
    if (!canDraw) return;

    playDealSound();
    setDrawsUsed((x) => x + 1);

    setDeck((curDeck) => {
      setDiscard((curDiscard) => {
        const t = takeTop(curDeck, curDiscard);
        if (!t.card) {
          return curDiscard;
        }

        setDeck(t.deck);
        setDiscard(t.discard);

        if (t.card.sym === "bomb") {
          triggerBomb("draw");
        } else {
          setDrawn(t.card);
          pushLog(`Drew ${LABEL[t.card.sym]}.`);
        }
        return t.discard;
      });

      return curDeck;
    });
  }

  function onDiscardDrawn() {
    if (boardLocked) return;
    if (!drawn) return;
    setDiscard((dc) => [...dc, drawn]);
    pushLog(`Discarded ${LABEL[drawn.sym]}.`);
    setDrawn(null);
    setSelected([]);
  }

  function onTapCell(idx: number) {
    if (boardLocked) return;

    if (drawn) {
      const placed = drawn;
      pushLog(`Replaced cell ${idx + 1} with ${LABEL[placed.sym]}.`);
      setDrawn(null);
      setSelected([]);

      setGrid((g) => {
        const next = g.slice();
        const old = next[idx];
        next[idx] = placed;
        if (old) setDiscard((dc) => [...dc, old]);
        return next;
      });
      if (placed.sym === "bomb") queueMicrotask(() => triggerBomb("placed"));
      return;
    }

    setSelected((sel) => {
      const exists = sel.includes(idx);
      if (exists) return sel.filter((x) => x !== idx);
      if (sel.length >= GRID_SIZE) return sel;
      return [...sel, idx];
    });
  }

  function onClearSelection() {
    setSelected([]);
  }

  function onScoreSelected() {
    if (drawn || boardLocked) return;
    if (winningLines.length === 0) return;

    playCoinDrop();

    const points = winningLines.reduce((sum, w) => sum + w.points, 0);
    const slots = Array.from(new Set(winningLines.flatMap((w) => w.line))).sort((a, b) => a - b);
    const cardsToDiscard = slots.map((i) => grid[i]).filter(Boolean) as Card[];

    setScore((s) => s + points);
    setSelected([]);

    const discardPool = [...discardRef.current, ...cardsToDiscard];
    const dealt = dealN(slots.length, deckRef.current, discardPool);
    const refill = dealt.cards.slice(0, slots.length);

    deckRef.current = dealt.deck;
    discardRef.current = dealt.discard;
    setDeck(dealt.deck);
    setDiscard(dealt.discard);

    setGrid((g) => {
      const next = g.slice();
      for (const i of slots) next[i] = null;
      return next;
    });

    spinCells(slots, () => {
      setGrid((g) => {
        const next = g.slice();
        for (let k = 0; k < slots.length; k++) {
          next[slots[k]] = refill[k] ?? null;
        }
        return next;
      });

      if (refill.some((c) => c?.sym === "bomb")) {
        queueMicrotask(() => triggerBomb("bomb appeared on refill"));
      }
    });

    const label = winningLines.length === 1 ? winningLines[0].label : winningLines.map((w) => w.label).join(" + ");
    pushLog(`Scored ${label} for ${points}.`);
  }

  const gameOver = drawsUsed >= DRAWS_MAX && drawn === null && !boardLocked && possibleWins.length === 0;
  const averageScore = stats.plays > 0 ? Math.round(stats.totalScore / stats.plays) : 0;

  useEffect(() => {
    if (!gameOver || gameRecorded) return;

    const updated: GameStats = {
      plays: stats.plays + 1,
      highScore: Math.max(stats.highScore, score),
      totalScore: stats.totalScore + score,
    };

    const avg = updated.plays > 0 ? Math.round(updated.totalScore / updated.plays) : 0;

    setStats(updated);
    saveStats(updated);
    setGameRecorded(true);

    uploadGameStats(updated.plays, updated.highScore, avg);

    if (updated.plays % 15 === 0) {
      window.setTimeout(() => {
        window.location.assign("https://www.amazon.com/dp/B0GDP6YTM9");
      }, 3000);
    }
  }, [gameOver, gameRecorded, score, stats]);

  const displayedAverageScore =
    gameOver && gameRecorded && stats.plays > 0 ? Math.round(stats.totalScore / stats.plays) : averageScore;

  // ---------- Styles ----------
  const styles = {
    page: {
      minHeight: "100vh",
      background: "#0b0b0c",
      color: "#f5f5f5",
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
      overflowY: "scroll",
      overflowX: "hidden",
    } as React.CSSProperties,
    container: {
      maxWidth: 460,
      margin: "0 auto",
      padding: "16px 16px 40px",
      boxSizing: "border-box",
    } as React.CSSProperties,
    card: {
      background: "#141416",
      border: "1px solid #2a2a2e",
      borderRadius: 18,
      padding: 12,
      boxShadow: "0 8px 20px rgba(0,0,0,0.25)",
    } as React.CSSProperties,
    row: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 } as React.CSSProperties,
    h1: { fontSize: 22, margin: 0, letterSpacing: 0.2 } as React.CSSProperties,
    btn: {
      background: "#24242a",
      border: "1px solid #2f2f36",
      color: "#f5f5f5",
      padding: "10px 12px",
      borderRadius: 14,
      fontWeight: 700,
      cursor: "pointer",
    } as React.CSSProperties,
    btnPrimary: {
      background: "#e9e9ee",
      border: "1px solid #e9e9ee",
      color: "#111",
      padding: "12px 12px",
      borderRadius: 14,
      fontWeight: 800,
      fontSize: 22,
      cursor: "pointer",
      flex: 1,
    } as React.CSSProperties,
    btnDisabled: { opacity: 0.45, cursor: "not-allowed" } as React.CSSProperties,
    stats: {
      display: "grid",
      alignItems: "start",
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: 8,
      marginTop: 10,
      marginBottom: 10,
    } as React.CSSProperties,
    stat: {
      background: "#141416",
      border: "1px solid #2a2a2e",
      borderRadius: 16,
      padding: 10,
    } as React.CSSProperties,
    statLabel: { fontSize: 11, color: "#a8a8b3" } as React.CSSProperties,
    statValue: { fontSize: 18, fontWeight: 800 } as React.CSSProperties,
    boardGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: 8,
      width: "100%",
      margin: "10px 0 0",
    } as React.CSSProperties,
    boardGridWrap: {
      position: "relative",
      width: "100%",
    } as React.CSSProperties,
    bombOverlay: {
      position: "absolute",
      inset: 0,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      pointerEvents: "none",
      zIndex: 15,
    } as React.CSSProperties,
    bombOverlayInner: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "100%",
      filter: "drop-shadow(0 10px 18px rgba(0,0,0,0.45))",
    } as React.CSSProperties,
    splashOverlay: {
      position: "fixed",
      inset: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(0,0,0,0.92)",
      zIndex: 100,
      padding: 20,
    } as React.CSSProperties,
    splashImage: {
      maxWidth: "min(92vw, 520px)",
      maxHeight: "88vh",
      width: "100%",
      height: "auto",
      objectFit: "contain",
      borderRadius: 18,
      boxShadow: "0 16px 42px rgba(0,0,0,0.45)",
    } as React.CSSProperties,
    helpScreen: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 16,
      background: "#141416",
      border: "1px solid #2a2a2e",
      borderRadius: 18,
      padding: 16,
      boxShadow: "0 8px 20px rgba(0,0,0,0.25)",
    } as React.CSSProperties,
    helpCloseBtn: {
      alignSelf: "center",
    } as React.CSSProperties,
    gameOverOverlay: {
      position: "absolute",
      inset: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(0,0,0,0.78)",
      textAlign: "center" as const,
      padding: 18,
      zIndex: 20,
      borderRadius: 12,
    } as React.CSSProperties,
    gameOverOverlayInner: {
      maxWidth: 560,
      width: "100%",
      background: "rgba(17,17,17,0.94)",
      border: "1px solid rgba(255,255,255,0.10)",
      borderRadius: 18,
      padding: 22,
      boxShadow: "0 14px 32px rgba(0,0,0,0.45)",
    } as React.CSSProperties,
    gameOverTitle: {
      fontWeight: 1000,
      fontSize: 24,
      marginBottom: 10,
    } as React.CSSProperties,
    gameOverText: {
      fontSize: 17,
      lineHeight: 1.5,
      color: "#f5f5f5",
    } as React.CSSProperties,
    gameOverStats: {
      marginTop: 18,
      marginBottom: 18,
      fontSize: 17,
      lineHeight: 1.8,
    } as React.CSSProperties,
    gameOverButtons: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 12,
      marginTop: 8,
    } as React.CSSProperties,
    gameOverShareButton: {
      background: "#36d399",
      border: "1px solid #36d399",
      color: "#ffffff",
      padding: "12px 16px",
      borderRadius: 14,
      fontWeight: 900,
      fontSize: 18,
      cursor: "pointer",
      width: "100%",
      maxWidth: 320,
    } as React.CSSProperties,
    gameOverOrderButton: {
      background: "#36d399",
      border: "1px solid #36d399",
      color: "#ffffff",
      padding: "12px 16px",
      borderRadius: 14,
      fontWeight: 900,
      fontSize: 18,
      cursor: "pointer",
      width: "100%",
      maxWidth: 320,
    } as React.CSSProperties,
    cell: {
      position: "relative",
      width: "100%",
      borderRadius: 16,
      border: "1px solid #2a2a2e",
      background: "#ffffff",
      overflow: "hidden",
      boxShadow: "0 6px 16px rgba(0,0,0,0.25)",
    } as React.CSSProperties,
    cellDisabled: { opacity: 0.55 } as React.CSSProperties,
    cellSelected: { border: "2px solid #f5f5f5", background: "#1b1b20" } as React.CSSProperties,
    cellIndex: { position: "absolute", left: 8, top: 8, fontSize: 11, color: "#7a7a86" } as React.CSSProperties,
    imgWrap: {
      position: "absolute",
      inset: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "10%",
    } as React.CSSProperties,
    controlsRow: { display: "flex", gap: 8, marginTop: 10 } as React.CSSProperties,
    drawnPanel: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      background: "#101012",
      border: "1px solid #2a2a2e",
      borderRadius: 16,
      padding: 10,
      marginTop: 10,
    } as React.CSSProperties,
    drawnBox: {
      width: 86,
      height: 86,
      borderRadius: 14,
      border: "1px solid #2a2a2e",
      background: "#0f0f11",
      overflow: "hidden",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    } as React.CSSProperties,
  };

  return (
    <div style={styles.page}>
      {showSplash ? (
        <div style={styles.splashOverlay} aria-label="Splash screen">
          <img src={SPLASH_SRC} alt="SLOTS Solitaire" style={styles.splashImage} />
        </div>
      ) : null}

      <div style={styles.container}>
        <header style={{ ...styles.row, marginBottom: 10 }}>
          <div>
            <h1 style={styles.h1}>SLOTS Solitaire v2.6</h1>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
{/*             <button style={styles.btn} onClick={forceGameOver}>Test Game Over</button> */}
            <button style={styles.btn} onClick={resetGame} disabled={showSplash}>
              New Game
            </button>
          </div>
        </header>

        {showHelp ? (
          <div style={styles.helpScreen}>
            <img
              src={HELP_IMAGE_SRC}
              alt="Help"
              style={{
                maxWidth: "100%",
                maxHeight: "180vh",
                width: "auto",
                height: "auto",
                objectFit: "contain",
              }}
            />
            <button
              style={{
                ...styles.btnPrimary,
                ...styles.helpCloseBtn,
                fontSize: 20,
                flex: "0 0 auto",
                padding: "6px 10px",
                height: 40,
                width: 120,
              }}
              onClick={() => setShowHelp(false)}
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <div style={styles.stats}>
              <Stat label="Score" value={score.toString()} />
              <Stat label="Draws" value={`${drawsUsed}/${DRAWS_MAX}`} />
              <button
                onClick={() => setShowHelp(true)}
                disabled={showSplash}
                style={{
                  ...styles.btnPrimary,
                  fontSize: 20,
                  flex: "0 0 auto",
                  padding: "6px 10px",
                  height: 60,
                  width: 120,
                  ...(showSplash ? styles.btnDisabled : {}),
                }}
              >
                HELP
              </button>
            </div>

            <div style={styles.card}>
              <div style={styles.boardGridWrap}>
                <div style={styles.boardGrid}>
                  {grid.map((card, idx) => {
                    const isSel = selected.includes(idx);
                    const showSym = spinSyms[idx] ?? card?.sym ?? null;
                    const isEmpty = showSym === null;
                    const disabled = isEmpty || boardLocked;

                    const cellStyle: React.CSSProperties = {
                      ...styles.cell,
                      ...(isEmpty ? styles.cellDisabled : {}),
                      ...(isSel ? styles.cellSelected : {}),
                      aspectRatio: "1 / 1",
                      cursor: disabled ? "not-allowed" : "pointer",
                    };

                    return (
                      <button
                        key={idx}
                        style={cellStyle}
                        onClick={() => onTapCell(idx)}
                        disabled={disabled}
                        aria-label={showSym ? LABEL[showSym] : "Empty"}
                      >
                        {showSym ? (
                          <div style={styles.imgWrap}>
                            <img
                              src={ASSET_MAP[showSym]}
                              alt={LABEL[showSym]}
                              style={{ width: "100%", height: "100%", objectFit: "contain" }}
                            />
                          </div>
                        ) : null}
                        <div style={styles.cellIndex}>{idx + 1}</div>
                      </button>
                    );
                  })}
                </div>

                {bombOverlay ? (
                  <div style={styles.bombOverlay} aria-label="Bomb overlay">
                    <div style={styles.bombOverlayInner}>
                      <img
                        src={ASSET_MAP.bomb}
                        alt="Bomb"
                        style={{ width: "clamp(220px, 60vw, 420px)", height: "auto", objectFit: "contain" }}
                      />
                    </div>
                  </div>
                ) : null}

                {gameOver ? (
                  <div style={styles.gameOverOverlay} aria-label="Game over message">
                    <div style={styles.gameOverOverlayInner}>
                      <div style={styles.gameOverTitle}>Great Game!</div>

                      <div style={styles.gameOverStats}>
                        <div>Number of Plays: {stats.plays}</div>
                        <div>High Score: {stats.highScore}</div>
                        <div>Average Score: {displayedAverageScore}</div>
                      </div>

                      <div style={styles.gameOverText}>
                        Share the free SLOTS Solitaire version with a friend. Buy the multi-player card game version to play with
                        friends at home.
                      </div>

                      <div style={styles.gameOverButtons}>
                        <button onClick={handleShareGame} style={styles.gameOverShareButton}>
                          Share With a Friend
                        </button>

                        <button
                          onClick={() => window.location.assign("https://www.amazon.com/dp/B0GDP6YTM9")}
                          style={styles.gameOverOrderButton}
                        >
                          Buy the Card Game
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              <div style={styles.controlsRow}>
                <button
                  onClick={onScoreSelected}
                  disabled={!(selectionInfo.ok && !drawn && !boardLocked)}
                  style={{
                    ...styles.btnPrimary,
                    ...(selectionInfo.ok && !drawn && !boardLocked ? {} : styles.btnDisabled),
                  }}
                >
                  {selectionInfo.ok ? "Cash In" : "Select a Win"}
                </button>
                <button
                  onClick={onClearSelection}
                  disabled={selected.length === 0 || boardLocked}
                  style={{
                    ...styles.btn,
                    ...(selected.length === 0 || boardLocked ? styles.btnDisabled : {}),
                  }}
                >
                  Clear
                </button>
              </div>

              <div style={styles.drawnPanel}>
                <div style={styles.drawnBox}>
                  <img
                    src={drawn ? ASSET_MAP[drawn.sym] : CARD_BACK_SRC}
                    alt={drawn ? LABEL[drawn.sym] : "Deck"}
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  />
                </div>

                <button
                  onClick={drawn ? onDiscardDrawn : onDraw}
                  disabled={boardLocked || (!drawn && !canDrawNow)}
                  style={{
                    ...styles.btnPrimary,
                    height: 86,
                    fontSize: 22,
                    ...(drawn
                      ? { background: "#24242a", borderColor: "#2f2f36", color: "#f5f5f5" }
                      : {
                          background: canDrawNow ? "#36d399" : "#24242a",
                          borderColor: canDrawNow ? "#36d399" : "#2f2f36",
                          color: canDrawNow ? "#ffffff" : "#a8a8b3",
                        }),
                    ...((drawn || canDrawNow) && !boardLocked ? {} : styles.btnDisabled),
                  }}
                >
                  {drawn ? "Discard Draw" : "Draw"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );

  function Stat({ label, value }: { label: string; value: string }) {
    return (
      <div style={styles.stat}>
        <div style={styles.statLabel}>{label}</div>
        <div style={styles.statValue}>{value}</div>
      </div>
    );
  }
}
