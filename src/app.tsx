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
const PLAYER_INFO_KEY = "slots_solitaire_player_info";
const PLAYER_INFO_SKIPPED_KEY = "slots_solitaire_player_info_skipped";
const AMAZON_LAST_INDEX_KEY = "slots_solitaire_amazon_last_index";
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

async function uploadGameStats(
    plays: number,
    highScore: number,
    averageScore: number,
    playerInfo: PlayerInfo | null
) {
    try {
        const payload = {
            plays: plays,
            highScore: highScore,
            averageScore: averageScore,
            sessionId: getSessionId(),
            firstName: playerInfo?.firstName ?? "",
            lastName: playerInfo?.lastName ?? "",
            phone: playerInfo?.phone ?? ""
        };

        const response = await fetch("https://d2xdybbmnhyevxwjhhb2qkftky0quyjy.lambda-url.us-east-1.on.aws/", {
            method: "POST",
            body: JSON.stringify(payload)
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

type PlayerInfo = {
  firstName: string;
  lastName: string;
  phone: string;
};

type ActiveTab = "game" | "help" | "stats" | "amazon";

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

function loadPlayerInfo(): PlayerInfo | null {
  try {
    const raw = localStorage.getItem(PLAYER_INFO_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const firstName = String(parsed.firstName || "").trim();
    const lastName = String(parsed.lastName || "").trim();
    const phone = String(parsed.phone || "").replace(/\D/g, "");
    if (!firstName || !lastName || phone.length !== 10) return null;
    return { firstName, lastName, phone };
  } catch {
    return null;
  }
}

function savePlayerInfo(playerInfo: PlayerInfo) {
  localStorage.setItem(PLAYER_INFO_KEY, JSON.stringify(playerInfo));
  localStorage.removeItem(PLAYER_INFO_SKIPPED_KEY);
}

function shouldPromptForPlayerInfo() {
  return !loadPlayerInfo() && localStorage.getItem(PLAYER_INFO_SKIPPED_KEY) !== "true";
}

function copyTextFallback(text: string) {
  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "true");
  input.style.position = "fixed";
  input.style.left = "-9999px";
  input.style.top = "0";
  document.body.appendChild(input);
  input.focus();
  input.select();

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(input);
  }
}

function getStoredAmazonIndex() {
  try {
    return Number(localStorage.getItem(AMAZON_LAST_INDEX_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveAmazonIndex(index: number) {
  try {
    localStorage.setItem(AMAZON_LAST_INDEX_KEY, index.toString());
  } catch {
    // Noncritical preference storage.
  }
}

const DRAWS_MAX = 25;
const GRID_SIZE = 9;
const AMAZON_RECOMMENDATIONS = [
  {
    title: "The Quietest Card Shuffler",
    description:
      "We've tried lots of card shufflers and this is the best one. It is quiet, rechargeable, and shuffles two decks.",
    image: "/assets/Shuffler.png",
    url: "https://www.amazon.com/dp/B0DJQXV11B/ref=cm_sw_r_as_gl_api_gl_i_EFT9NPMSS6ZA6X33T83K?linkCode=ml1&tag=kevinreagan-20&linkId=e6b35e96b72d07211dd9eb4acdac7dc2&th=1&content_source=fb&fb_content_id=Q9-wBQHnYtDOEYduQJUZooA52qof8tVWv9hT0-88GNYml_LwYBjZ3kFOe-EvgG5bZw&channel_type=fb&fbclid=IwY2xjawRuFkNleHRuA2FlbQIxMQBzcnRjBmFwcF9pZBAyMjIwMzkxNzg4MjAwODkyAAEeGTmOL2uANuQZLupT6ztUeoLM7eyUDhtkuVCLtdpebKclCFkG13U0lWaEWs0_aem_t9inxxsa5sI9A8ZD4M_cEg",
  },
  {
    title: "Amazon Basics AAA Batteries",
    description: "These batteries are just as good as the leading brands at a much lower cost.",
    image: "/assets/Batteries.png",
    url: "https://amzn.to/4tAyD0h",
  },
  {
    title: "What the Heck!",
    description: "Use these to play SLOTS in bed without straining your neck.",
    image: "/assets/Shutter.png",
    url: "https://amzn.to/4wm6U6h",
  },
  {
    title: "SLOTS Card Game",
    description: "Get the card game version of SLOTS to play with your friends and family at home.",
    image: "/assets/SlotsCardGame.png",
    url: "https://www.amazon.com/dp/B0GDP6YTM9",
  },
];

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
  const [activeTab, setActiveTab] = useState<ActiveTab>("game");
  const [amazonIndex, setAmazonIndex] = useState(0);
  const [stats, setStats] = useState<GameStats>({ plays: 0, highScore: 0, totalScore: 0 });
  const [gameRecorded, setGameRecorded] = useState(false);
  const [showPlayerPrompt, setShowPlayerPrompt] = useState(false);
  const [playerForm, setPlayerForm] = useState<PlayerInfo>({ firstName: "", lastName: "", phone: "" });
  const [playerFormError, setPlayerFormError] = useState("");
  const amazonTouchStartX = useRef<number | null>(null);
  const [scoreBam, setScoreBam] = useState<number | null>(null);
  const [showGameOverStatsTitle, setShowGameOverStatsTitle] = useState(false);

  const splashTimer = useRef<number | null>(null);
  const bombTimer = useRef<number | null>(null);
  const scoreBamTimer = useRef<number | null>(null);
  const deckRef = useRef<Card[]>([]);
  const discardRef = useRef<Card[]>([]);

  async function handleShareGame() {
    const gameUrl = window.location.href;
    const shareData = {
      title: "SLOTS Solitaire",
      text: `SLOTS Solitaire is addictive. Play it and see if you can beat my high score of ${stats.highScore}.`,
      url: gameUrl,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }

    if (copyTextFallback(gameUrl)) {
      window.alert(
        "A shareable link to the game has been copied. Now simply paste it into a text message, messenger message, or email to share it with your friends."
      );
      return;
    }

    window.prompt("Copy this link and paste it into a text message or email:", gameUrl);
  }

  function setAmazonProductIndex(index: number) {
    const next = (index + AMAZON_RECOMMENDATIONS.length) % AMAZON_RECOMMENDATIONS.length;
    setAmazonIndex(next);
    saveAmazonIndex(next);
  }

  function openAmazonPicks() {
    const next = (getStoredAmazonIndex() + 1) % AMAZON_RECOMMENDATIONS.length;
    setAmazonProductIndex(next);
    setShowGameOverStatsTitle(false);
    setActiveTab("amazon");
  }

  function shiftAmazonProduct(direction: -1 | 1) {
    setAmazonProductIndex(amazonIndex + direction);
  }

  function handleAmazonTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    amazonTouchStartX.current = event.touches[0]?.clientX ?? null;
  }

  function handleAmazonTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    if (amazonTouchStartX.current === null) return;
    const endX = event.changedTouches[0]?.clientX ?? amazonTouchStartX.current;
    const deltaX = endX - amazonTouchStartX.current;
    amazonTouchStartX.current = null;

    if (Math.abs(deltaX) < 40) return;
    shiftAmazonProduct(deltaX < 0 ? 1 : -1);
  }

  function openAmazonProduct(url: string) {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function forceGameOver() {
    if (bombOverlay || isSpinning || showSplash) return;
    setDrawn(null);
    setSelected([]);
    setGrid(Array(GRID_SIZE).fill(null));
    setSpinSyms(Array(GRID_SIZE).fill(null));
    setDrawsUsed(DRAWS_MAX);
    pushLog("Forced Game Over for testing.");
  }

  function savePlayerForm() {
    const firstName = playerForm.firstName.trim();
    const lastName = playerForm.lastName.trim();
    const phone = playerForm.phone.replace(/\D/g, "");

    if (!firstName || !lastName || phone.length !== 10) {
      setPlayerFormError("Please enter a first name, last name, and 10 digit phone number.");
      return;
    }

    savePlayerInfo({ firstName, lastName, phone });
    setPlayerForm({ firstName, lastName, phone });
    setPlayerFormError("");
    setShowPlayerPrompt(false);
  }

  function skipPlayerForm() {
    localStorage.setItem(PLAYER_INFO_SKIPPED_KEY, "true");
    setPlayerFormError("");
    setShowPlayerPrompt(false);
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

  function showScoreBam(points: number) {
    if (points <= 0) return;

    if (scoreBamTimer.current !== null) {
      window.clearTimeout(scoreBamTimer.current);
      scoreBamTimer.current = null;
    }

    setScoreBam(points);
    scoreBamTimer.current = window.setTimeout(() => {
      setScoreBam(null);
      scoreBamTimer.current = null;
    }, 900);
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
    if (scoreBamTimer.current) {
      window.clearTimeout(scoreBamTimer.current);
      scoreBamTimer.current = null;
    }

    stopSpinTimers();
    setBombOverlay(false);
    setGameRecorded(false);
    setDrawn(null);
    setSelected([]);
    setGrid(Array(GRID_SIZE).fill(null));
    setSpinSyms(Array(GRID_SIZE).fill(null));
    setScoreBam(null);
    setShowGameOverStatsTitle(false);
    setActiveTab("game");
    setShowSplash(true);
    if (shouldPromptForPlayerInfo()) {
      setShowPlayerPrompt(true);
    }

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
      if (scoreBamTimer.current) {
        window.clearTimeout(scoreBamTimer.current);
        scoreBamTimer.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setStats(loadStats());
  }, []);

  useEffect(() => {
    const playerInfo = loadPlayerInfo();
    if (playerInfo) {
      setPlayerForm(playerInfo);
    } else if (shouldPromptForPlayerInfo()) {
      setShowPlayerPrompt(true);
    }
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
    showScoreBam(points);
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
    setShowGameOverStatsTitle(true);
    setActiveTab("stats");

    uploadGameStats(updated.plays, updated.highScore, avg, loadPlayerInfo());
  }, [gameOver, gameRecorded, score, stats]);

  const displayedAverageScore =
    gameOver && gameRecorded && stats.plays > 0 ? Math.round(stats.totalScore / stats.plays) : averageScore;
  const amazonProduct = AMAZON_RECOMMENDATIONS[amazonIndex];

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
    tabs: {
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: 6,
      marginBottom: 10,
    } as React.CSSProperties,
    tab: {
      background: "#1f1f25",
      border: "1px solid #303038",
      color: "#d7d7df",
      padding: "10px 6px",
      borderRadius: 10,
      fontWeight: 800,
      fontSize: 14,
      cursor: "pointer",
      minHeight: 44,
    } as React.CSSProperties,
    tabActive: {
      background: "#e9e9ee",
      border: "1px solid #e9e9ee",
      color: "#111",
    } as React.CSSProperties,
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
    helpImage: {
      display: "block",
      width: "100%",
      maxWidth: 430,
      height: "auto",
      background: "#ffffff",
      borderRadius: 10,
    } as React.CSSProperties,
    helpCloseBtn: {
      alignSelf: "center",
    } as React.CSSProperties,
    statsScreen: {
      background: "#141416",
      border: "1px solid #2a2a2e",
      borderRadius: 18,
      padding: 16,
      boxShadow: "0 8px 20px rgba(0,0,0,0.25)",
    } as React.CSSProperties,
    statsScreenTitle: {
      margin: "0 0 12px",
      fontSize: 22,
      fontWeight: 900,
    } as React.CSSProperties,
    statsScreenGrid: {
      display: "grid",
      gap: 10,
    } as React.CSSProperties,
    statsActions: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 12,
      marginTop: 16,
    } as React.CSSProperties,
    amazonScreen: {
      background: "#141416",
      border: "1px solid #2a2a2e",
      borderRadius: 18,
      padding: 16,
      boxShadow: "0 8px 20px rgba(0,0,0,0.25)",
    } as React.CSSProperties,
    amazonIntro: {
      margin: "0 0 14px",
      color: "#d7d7df",
      fontSize: 15,
      lineHeight: 1.45,
    } as React.CSSProperties,
    amazonProduct: {
      background: "#101012",
      border: "1px solid #303038",
      borderRadius: 12,
      padding: 14,
      display: "grid",
      justifyItems: "center",
      gap: 10,
      touchAction: "pan-y",
    } as React.CSSProperties,
    amazonProductTitle: {
      margin: 0,
      fontSize: 18,
      lineHeight: 1.25,
      fontWeight: 900,
    } as React.CSSProperties,
    amazonProductDescription: {
      margin: 0,
      color: "#c8c8d2",
      fontSize: 14,
      lineHeight: 1.45,
    } as React.CSSProperties,
    amazonImageButton: {
      display: "block",
      width: "100%",
      maxWidth: 360,
      padding: 0,
      border: 0,
      background: "transparent",
      cursor: "pointer",
    } as React.CSSProperties,
    amazonProductImage: {
      width: "100%",
      maxWidth: 360,
      borderRadius: 10,
      border: "1px solid #303038",
      display: "block",
      height: "auto",
    } as React.CSSProperties,
    amazonCarouselControls: {
      width: "100%",
      maxWidth: 320,
      display: "grid",
      gridTemplateColumns: "48px 1fr 48px",
      alignItems: "center",
      gap: 8,
    } as React.CSSProperties,
    amazonArrowButton: {
      width: 48,
      height: 44,
      borderRadius: 12,
      border: "1px solid #303038",
      background: "#24242a",
      color: "#ffffff",
      fontSize: 30,
      lineHeight: 1,
      fontWeight: 900,
      cursor: "pointer",
    } as React.CSSProperties,
    amazonCounter: {
      color: "#d7d7df",
      fontSize: 14,
      fontWeight: 800,
      textAlign: "center" as const,
    } as React.CSSProperties,
    playerOverlay: {
      position: "fixed",
      inset: 0,
      zIndex: 120,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 18,
      background: "rgba(0,0,0,0.82)",
    } as React.CSSProperties,
    playerDialog: {
      width: "100%",
      maxWidth: 420,
      background: "#141416",
      border: "1px solid #34343d",
      borderRadius: 16,
      padding: 18,
      boxShadow: "0 16px 42px rgba(0,0,0,0.45)",
    } as React.CSSProperties,
    playerPrompt: {
      margin: "0 0 14px",
      color: "#f5f5f5",
      fontSize: 16,
      lineHeight: 1.45,
    } as React.CSSProperties,
    fieldLabel: {
      display: "block",
      fontSize: 12,
      fontWeight: 800,
      color: "#bdbdc8",
      marginBottom: 5,
    } as React.CSSProperties,
    input: {
      width: "100%",
      boxSizing: "border-box",
      background: "#0f0f11",
      border: "1px solid #34343d",
      borderRadius: 10,
      color: "#f5f5f5",
      padding: "10px 12px",
      fontSize: 16,
      marginBottom: 10,
    } as React.CSSProperties,
    formError: {
      color: "#ffb4b4",
      fontSize: 13,
      marginBottom: 10,
    } as React.CSSProperties,
    playerDialogActions: {
      display: "flex",
      gap: 10,
      alignItems: "center",
    } as React.CSSProperties,
    scoreBam: {
      position: "absolute",
      left: "50%",
      top: "45%",
      transform: "translate(-50%, -50%) rotate(-4deg)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minWidth: 190,
      padding: "16px 24px",
      background: "#ffcf33",
      color: "#111111",
      border: "4px solid #ffffff",
      borderRadius: 18,
      boxShadow: "0 16px 34px rgba(0,0,0,0.45)",
      textAlign: "center" as const,
      zIndex: 30,
      pointerEvents: "none",
    } as React.CSSProperties,
    scoreBamPoints: {
      fontSize: 30,
      fontWeight: 1000,
      lineHeight: 1.05,
      textShadow: "1px 1px 0 #ffffff",
    } as React.CSSProperties,
    statsGameOverTitle: {
      margin: "0 0 12px",
      color: "#ffcf33",
      fontSize: 28,
      lineHeight: 1.1,
      fontWeight: 1000,
      textAlign: "center" as const,
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
            <h1 style={styles.h1}>SLOTS Solitaire v3.11</h1>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={styles.btn} onClick={resetGame} disabled={showSplash}>
              New Game
            </button>
          </div>
        </header>

        <div style={styles.tabs} role="tablist" aria-label="SLOTS Solitaire sections">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "game"}
            onClick={() => {
              setShowGameOverStatsTitle(false);
              setActiveTab("game");
            }}
            style={{ ...styles.tab, ...(activeTab === "game" ? styles.tabActive : {}) }}
          >
            Game
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "help"}
            onClick={() => {
              setShowGameOverStatsTitle(false);
              setActiveTab("help");
            }}
            style={{ ...styles.tab, ...(activeTab === "help" ? styles.tabActive : {}) }}
          >
            Help
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "stats"}
            onClick={() => {
              setShowGameOverStatsTitle(false);
              setActiveTab("stats");
            }}
            style={{ ...styles.tab, ...(activeTab === "stats" ? styles.tabActive : {}) }}
          >
            Stats
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "amazon"}
            onClick={openAmazonPicks}
            style={{ ...styles.tab, ...(activeTab === "amazon" ? styles.tabActive : {}) }}
          >
            Amazon
          </button>
        </div>

        {activeTab === "help" ? (
          <div style={styles.helpScreen}>
            <img
              src={HELP_IMAGE_SRC}
              alt="Help"
              style={styles.helpImage}
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
              onClick={() => setActiveTab("game")}
            >
              Close
            </button>
          </div>
        ) : activeTab === "stats" ? (
          <div style={styles.statsScreen}>
            {showGameOverStatsTitle ? <h2 style={styles.statsGameOverTitle}>Game Over</h2> : null}
            <h2 style={styles.statsScreenTitle}>Stats</h2>
            <div style={styles.statsScreenGrid}>
              <Stat label="Current Score" value={score.toString()} />
              <Stat label="Current Draws" value={`${drawsUsed}/${DRAWS_MAX}`} />
              <Stat label="Number of Plays" value={stats.plays.toString()} />
              <Stat label="High Score" value={stats.highScore.toString()} />
              <Stat label="Average Score" value={displayedAverageScore.toString()} />
            </div>
            <div style={styles.statsActions}>
              <button type="button" onClick={handleShareGame} style={styles.gameOverShareButton}>
                Share With a Friend
              </button>

              <button
                type="button"
                onClick={() => window.location.assign("https://www.amazon.com/dp/B0GDP6YTM9")}
                style={styles.gameOverOrderButton}
              >
                Buy the Card Game
              </button>
            </div>
          </div>
        ) : activeTab === "amazon" ? (
          <div style={styles.amazonScreen}>
            <h2 style={styles.statsScreenTitle}>Amazon Picks</h2>
            <p style={styles.amazonIntro}>Products Kevin recommends through his Amazon affiliate program.</p>

            <div
              key={amazonProduct.url}
              style={styles.amazonProduct}
              onTouchStart={handleAmazonTouchStart}
              onTouchEnd={handleAmazonTouchEnd}
            >
              <button
                type="button"
                onClick={() => openAmazonProduct(amazonProduct.url)}
                style={styles.amazonImageButton}
                aria-label={`View ${amazonProduct.title} on Amazon`}
              >
                <img src={amazonProduct.image} alt={amazonProduct.title} style={styles.amazonProductImage} />
              </button>
              <h3 style={styles.amazonProductTitle}>{amazonProduct.title}</h3>
              <p style={styles.amazonProductDescription}>{amazonProduct.description}</p>

              <div style={styles.amazonCarouselControls}>
                <button
                  type="button"
                  aria-label="Previous Amazon pick"
                  onClick={() => shiftAmazonProduct(-1)}
                  style={styles.amazonArrowButton}
                >
                  ‹
                </button>
                <div style={styles.amazonCounter}>
                  {amazonIndex + 1}/{AMAZON_RECOMMENDATIONS.length}
                </div>
                <button
                  type="button"
                  aria-label="Next Amazon pick"
                  onClick={() => shiftAmazonProduct(1)}
                  style={styles.amazonArrowButton}
                >
                  ›
                </button>
              </div>

              <button
                type="button"
                onClick={() => openAmazonProduct(amazonProduct.url)}
                style={{ ...styles.gameOverOrderButton, justifySelf: "center" }}
              >
                View on Amazon
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={styles.stats}>
              <Stat label="Score" value={score.toString()} />
              <Stat label="Draws" value={`${drawsUsed}/${DRAWS_MAX}`} />
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

                {scoreBam !== null ? (
                  <div style={styles.scoreBam} aria-live="polite">
                    <div style={styles.scoreBamPoints}>+{scoreBam} POINTS</div>
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
                      ? { background: "#24242a", border: "1px solid #2f2f36", color: "#f5f5f5" }
                      : {
                          background: canDrawNow ? "#36d399" : "#24242a",
                          border: `1px solid ${canDrawNow ? "#36d399" : "#2f2f36"}`,
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

      {showPlayerPrompt ? (
        <div style={styles.playerOverlay} role="dialog" aria-modal="true" aria-label="Player information">
          <div style={styles.playerDialog}>
            <p style={styles.playerPrompt}>
              Kevin, the developer of this game, would like to know who is playing his game. Would you mind sharing your
              name and phone number? We will never call you or share your personal information.
            </p>

            <label style={styles.fieldLabel} htmlFor="player-first-name">
              First Name
            </label>
            <input
              id="player-first-name"
              style={styles.input}
              value={playerForm.firstName}
              onChange={(event) => setPlayerForm((form) => ({ ...form, firstName: event.target.value }))}
              autoComplete="given-name"
            />

            <label style={styles.fieldLabel} htmlFor="player-last-name">
              Last Name
            </label>
            <input
              id="player-last-name"
              style={styles.input}
              value={playerForm.lastName}
              onChange={(event) => setPlayerForm((form) => ({ ...form, lastName: event.target.value }))}
              autoComplete="family-name"
            />

            <label style={styles.fieldLabel} htmlFor="player-phone">
              10 Digit Phone Number
            </label>
            <input
              id="player-phone"
              style={styles.input}
              value={playerForm.phone}
              onChange={(event) => setPlayerForm((form) => ({ ...form, phone: event.target.value.replace(/\D/g, "").slice(0, 10) }))}
              autoComplete="tel"
              inputMode="numeric"
              maxLength={10}
            />

            {playerFormError ? <div style={styles.formError}>{playerFormError}</div> : null}

            <div style={styles.playerDialogActions}>
              <button type="button" style={styles.btnPrimary} onClick={savePlayerForm}>
                Continue
              </button>
              <button type="button" style={styles.btn} onClick={skipPlayerForm}>
                Skip
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
