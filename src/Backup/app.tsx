import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * SLOTS Solitaire (mobile-first) — single-file React prototype (NO Tailwind required)
 *
 * Assets expected in: /public/assets/
 *   crown.png, diamond.png, present.png, seven.png, bar.png, cherry.png, jewel.png, bomb.png
 */

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
// Put your image at: public/assets/cardback.png
const CARD_BACK_SRC = "/assets/cardback.png";

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

function isLine(selection: number[]): boolean {
  if (selection.length !== 3) return false;
  const s = selection.slice().sort((a, b) => a - b);
  return LINES.some((ln) => ln[0] === s[0] && ln[1] === s[1] && ln[2] === s[2]);
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

  // Dealing animation (slot-style spin) — shows random symbols briefly before committing the real card(s)
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
    // Prevent overlapping spins
    stopSpinTimers();
    setIsSpinning(true);

    // Prime with an initial symbol so it instantly shows
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
  const bombTimer = useRef<number | null>(null);

  const canDraw = drawsUsed < DRAWS_MAX && drawn === null;

  const selectionInfo = useMemo(() => {
    if (selected.length !== 3) return { validLine: false, ok: false, points: 0, label: "Select 3 cards" };
    if (!isLine(selected)) return { validLine: false, ok: false, points: 0, label: "Selection must be a straight line" };
    const cards = selected.map((i) => grid[i]).filter(Boolean) as Card[];
    if (cards.length !== 3) return { validLine: true, ok: false, points: 0, label: "Invalid selection" };
    const ev = evaluateLine(cards);
    return { validLine: true, ...ev };
  }, [selected, grid]);

  function pushLog(text: string) {
    setLog((l) => clampLog([...l, { id: uid("log"), ts: Date.now(), text }], 12));
  }

  function ensureDeckAvailable(curDeck: Card[], curDiscard: Card[]) {
    if (curDeck.length > 0) return { d: curDeck, dc: curDiscard };
    if (curDiscard.length === 0) return { d: curDeck, dc: curDiscard };
    const reshuffled = shuffle(curDiscard);
    return { d: reshuffled, dc: [] as Card[] };
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

  function resetGame() {
    if (bombTimer.current) {
      window.clearTimeout(bombTimer.current);
      bombTimer.current = null;
    }
    setBombOverlay(false);

    // Build a fresh shuffled deck and deal the initial 9 cards.
    const d = shuffle(buildDeck());
    const dealt = dealN(9, d, []);

    // Reset core state immediately.
    setDeck(dealt.deck);
    setDiscard(dealt.discard);
    setDrawn(null);
    setDrawsUsed(0);
    setScore(0);
    setSelected([]);
    setLog([]);
    pushLog("New game started");

    // Slot-style spin animation for the initial deal (all 9 cells).
    spinCells(
      Array.from({ length: GRID_SIZE }, (_, i) => i),
      () => {
        setGrid(dealt.cards);

        // If a bomb is present on the initial deal, trigger it AFTER the deal animation commits.
        if (dealt.cards.some((c) => c.sym === "bomb")) {
          triggerBomb("Bomb appeared on deal");
        }
      }
    );
  }

  useEffect(() => {
    resetGame();
    return () => {
      stopSpinTimers();
      if (bombTimer.current) {
        window.clearTimeout(bombTimer.current);
        bombTimer.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function triggerBomb(reason: string) {
    // Prevent re-entrancy while an animation is already running
    if (bombTimer.current) return;

    setSelected([]);
    setDrawn(null);
    setBombOverlay(true);

    // After a short "BOOM" overlay, wipe + redeal
    bombTimer.current = window.setTimeout(() => {
      // Move all grid cards to discard, clear grid
      setGrid((g) => {
        const toDiscard = g.filter(Boolean) as Card[];
        setDiscard((dc) => [...dc, ...toDiscard]);
        return Array(GRID_SIZE).fill(null);
      });

      // Redeal 9 using current deck+discard (spin all 9 cells together)
      setDeck((curDeck) => {
        queueMicrotask(() => {
          setDiscard((curDiscard) => {
            const ensured = ensureDeckAvailable(curDeck, curDiscard);
            const dealt = dealN(9, ensured.d, ensured.dc);

            // Apply deck/discard immediately, but delay showing the dealt cards until after the spin animation
            setDeck(dealt.deck);
            setDiscard(dealt.discard);

            // Hide the big bomb overlay, then spin all 9 and commit the redeal
            setBombOverlay(false);
            const all = Array.from({ length: GRID_SIZE }, (_, i) => i);
            spinCells(all, () => {
              setGrid(dealt.cards);
              if (dealt.cards.some((c) => c.sym === "bomb")) queueMicrotask(() => triggerBomb("Bomb appeared on redeal"));
            });

            // Clear bomb timer (overlay timer)
            window.clearTimeout(bombTimer.current!);
            bombTimer.current = null;

            return dealt.discard;
          });
        });
        return curDeck;
      });
      pushLog(`💣 Bomb triggered (${reason}). Board wiped + redealt.`);
    }, 1800);
  }

  function onDraw() {
    if (bombOverlay || isSpinning) return;
    if (!canDraw) return;

    setDrawsUsed((x) => x + 1);

    // Use current deck/discard snapshots via functional updates
    setDeck((curDeck) => {
      setDiscard((curDiscard) => {
        const t = takeTop(curDeck, curDiscard);
        if (!t.card) {
          return curDiscard;
        }

        // apply updated deck/discard
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
    if (bombOverlay || isSpinning) return;
    if (!drawn) return;
    setDiscard((dc) => [...dc, drawn]);
    pushLog(`Discarded ${LABEL[drawn.sym]}.`);
    setDrawn(null);
    setSelected([]);
  }

  function onTapCell(idx: number) {
    if (bombOverlay || isSpinning) return;
    if (drawn) {
      const placed = drawn;
      pushLog(`Replaced cell ${idx + 1} with ${LABEL[placed.sym]}.`);
      setDrawn(null);
      setSelected([]);

      // Place the drawn card immediately (no spin on user placement)
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
      if (sel.length >= 3) return sel;
      return [...sel, idx];
    });
  }

  function onClearSelection() {
    setSelected([]);
  }

  function onScoreSelected() {
    if (selected.length !== 3) return;
    if (!isLine(selected)) {
      return;
    }

    const cards = selected.map((i) => grid[i]).filter(Boolean) as Card[];
    if (cards.length !== 3) return;

    const ev = evaluateLine(cards);
    if (!ev.ok) {
      return;
    }

    const slots = selected.slice().sort((a, b) => a - b);

    setScore((s) => s + ev.points);
    setDiscard((dc) => [...dc, ...cards]);

    setGrid((g) => {
      const next = g.slice();
      for (const i of slots) next[i] = null;
      return next;
    });

    setDeck((curDeck) => {
      setDiscard((curDiscard) => {
        const ensured = ensureDeckAvailable(curDeck, curDiscard);
        const dealt = dealN(3, ensured.d, ensured.dc);

        setDeck(dealt.deck);
        setDiscard(dealt.discard);

        // Spin only the changed cells, then commit the refill cards
        const refill = dealt.cards.slice(0, slots.length);
        spinCells(slots, () => {
          setGrid((g) => {
            const next = g.slice();
            for (let k = 0; k < slots.length; k++) next[slots[k]] = refill[k] ?? null;
            return next;
          });
          if (refill.some((c) => c?.sym === "bomb")) queueMicrotask(() => triggerBomb("bomb appeared on refill"));
        });

        return dealt.discard;
      });

      return curDeck;
    });

    pushLog(`Scored ${ev.label} for ${ev.points}.`);
    setSelected([]);
  }

  const gameOver = drawsUsed >= DRAWS_MAX && drawn === null;

  // ---------- Styles (no Tailwind required) ----------
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
    sub: { margin: "4px 0 0", fontSize: 13, color: "#a8a8b3" } as React.CSSProperties,
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
      cursor: "pointer",
      flex: 1,
    } as React.CSSProperties,
    btnDisabled: { opacity: 0.45, cursor: "not-allowed" } as React.CSSProperties,
    stats: {
      display: "grid",
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

    boardHeader: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 } as React.CSSProperties,
    boardNote: { fontSize: 12, color: "#a8a8b3" } as React.CSSProperties,

      boardGrid: {
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
          width: "100%",
          margin: "10px 0 0",
      },

      boardGridWrap: {
          position: "relative",
          width: "100%",
      },

      bombOverlay: {
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          pointerEvents: "none",
      },

      bombOverlayInner: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          filter: "drop-shadow(0 10px 18px rgba(0,0,0,0.45))",
      },

      bombOverlayText: {
          fontSize: 34,
          fontWeight: 1000,
          letterSpacing: 2,
          textTransform: "uppercase" as const,
          textShadow: "0 10px 22px rgba(0,0,0,0.55)",
      },

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

    drawRow: { display: "flex", gap: 8, marginTop: 10, alignItems: "stretch" } as React.CSSProperties,
    drawBtnSmall: {
      padding: "10px 12px",
      borderRadius: 14,
      fontWeight: 900,
      cursor: "pointer",
      width: 160,
      maxWidth: "44vw",
    } as React.CSSProperties,

    toast: {
      background: "#101012",
      border: "1px solid #2a2a2e",
      borderRadius: 16,
      padding: 12,
    } as React.CSSProperties,

    info: { marginTop: 10, fontSize: 14, color: "#d8d8de" } as React.CSSProperties,
    faint: { color: "#a8a8b3" } as React.CSSProperties,

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
    drawnTitle: { fontWeight: 900, marginBottom: 2 } as React.CSSProperties,
    drawnHint: { fontSize: 12, color: "#a8a8b3", lineHeight: 1.35, minHeight: 34 } as React.CSSProperties,
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <header style={{ ...styles.row, marginBottom: 10 }}>
          <div>
            <h1 style={styles.h1}>SLOTS Solitaire</h1>
          {/*  <p style={styles.sub}>Mobile-first • Single player • Manual scoring</p>*/}
          </div>
          <button style={styles.btn} onClick={resetGame}>
            New Game
          </button>
        </header>

        <div style={styles.stats}>
          <Stat label="Score" value={score.toString()} />
          <Stat label="Draws" value={`${drawsUsed}/${DRAWS_MAX}`} />
        {/*  <Stat label="Remaining Cards In Deck" value={`${deck.length}`} />*/}
        </div>

        <div style={styles.card}>
          {/*<div style={styles.boardHeader}>*/}
          {/*  <div style={{ fontSize: 14, fontWeight: 900 }}>Board</div>*/}
          {/*  <div style={styles.boardNote}>Tap cards to select a line • Tap again to unselect</div>*/}
          {/*</div>*/}

          <div style={styles.boardGridWrap}>
          <div style={styles.boardGrid}>
            {grid.map((card, idx) => {
              const isSel = selected.includes(idx);
              const showSym = spinSyms[idx] ?? card?.sym ?? null;
              const isEmpty = showSym === null;
              const disabled = isEmpty || bombOverlay || isSpinning;

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
                <img src={ASSET_MAP.bomb} alt="Bomb" style={{ width: "clamp(220px, 60vw, 420px)", height: "auto", objectFit: "contain" }} />
              </div>
              {/*<div style={styles.bombOverlayText}>BOMB!</div>*/}
            </div>
          ) : null}
        </div>

          {/* Controls */}
          <div style={styles.controlsRow}>
            <button
              onClick={onScoreSelected}
              disabled={!(selected.length === 3 && isLine(selected) && selectionInfo.ok && !drawn && !bombOverlay)}
              style={{
                ...styles.btnPrimary,
                ...(selected.length === 3 && isLine(selected) && selectionInfo.ok && !drawn && !bombOverlay ? {} : styles.btnDisabled),
              }}
            >
            {selected.length === 3 && isLine(selected) && selectionInfo.ok
                ? "Cash In"
                : "Select Winning Cards"}
            </button>
              {selected.length > 0 && (

            <button onClick={onClearSelection} style={styles.btn}>
              Clear
            </button>
                        )}
</div>


{/* Draw / Deck */}
<div style={styles.drawRow}>
  <div style={styles.drawnBox} aria-label="Deck preview">
    <img
      src={drawn ? ASSET_MAP[drawn.sym] : CARD_BACK_SRC}
      alt={drawn ? LABEL[drawn.sym] : "Deck"}
      style={{ width: "100%", height: "100%", objectFit: "contain" }}
    />
  </div>

  <button
    onClick={drawn ? onDiscardDrawn : onDraw}
    disabled={bombOverlay || isSpinning || (!drawn && !canDraw)}
    style={{
      ...styles.btnPrimary,
      ...styles.drawBtnSmall,
      ...(drawn
        ? { background: "#24242a", borderColor: "#2f2f36", color: "#f5f5f5" }
        : {
            background: canDraw ? "#36d399" : "#24242a",
            borderColor: canDraw ? "#36d399" : "#2f2f36",
            color: canDraw ? "#08110d" : "#a8a8b3",
          }),
      ...((drawn || canDraw) ? {} : styles.btnDisabled),
    }}
  >
    {drawn ? "Discard" : "Draw"}
  </button>
</div>

          {gameOver ? (
            <div style={{ ...styles.toast, marginTop: 12 }}>
              <div style={{ fontWeight: 900 }}>Game over — {DRAWS_MAX} draws used</div>
              {/*<div style={{ color: "#a8a8b3", marginTop: 4 }}>Final score: {score}</div>*/}
              <button onClick={resetGame} style={{ ...styles.btnPrimary, width: "100%", marginTop: 10 }}>
                Play again
              </button>
            </div>
          ) : null}

        {/*  <div style={{ marginTop: 12, fontSize: 12, color: "#a8a8b3", lineHeight: 1.5 }}>*/}
        {/*    <div style={{ fontWeight: 900, color: "#d8d8de", marginBottom: 6 }}>Rules</div>*/}
        {/*    <div>• Select exactly 3 cards in a straight line, then press <strong>Cash In</strong>.</div>*/}
        {/*    <div>• Crown is wild. 3 Crowns = 1000.</div>*/}
        {/*    <div>• 3 Diamonds=500 • 3 Presents=400 • 3 7s=300 • 3 BARs=200 • 3 Cherries=100 • 3 Jewels=0.</div>*/}
        {/*    <div>• Bomb wipes the whole board and redeals 9.</div>*/}
        {/*    <div>• You can score multiple times between draws (“let it ride”).</div>*/}
        {/*  </div>*/}
        </div>
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