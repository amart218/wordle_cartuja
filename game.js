// =============================================================
//  game.js — Lógica principal de WORDLE ES
// =============================================================

(function () {
  "use strict";

  // ── Constantes ─────────────────────────────────────────────
  const WORD_LENGTH   = 5;
  const MAX_GUESSES   = 6;
  const FLIP_DURATION = 500; // ms por tile
  const FLIP_DELAY    = 300; // ms entre tiles
  const STORAGE_KEY   = "wordlees_state";
  const STATS_KEY     = "wordlees_stats";

  // ── Estado del juego ───────────────────────────────────────
  let state = {
    wordIndex : 0,
    solution  : "",
    guesses   : [],       // array de strings
    currentRow: 0,
    currentCol: 0,
    gameOver  : false,
    won       : false,
    savedDate : "",
  };

  // ── Stats ──────────────────────────────────────────────────
  let stats = {
    played    : 0,
    wins      : 0,
    streak    : 0,
    maxStreak : 0,
    dist      : { 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 },
  };

  // ── Init ───────────────────────────────────────────────────
  function init() {
    loadStats();
    const { index, solution } = getDailyWord();
    state.wordIndex = index;
    state.solution  = solution;

    buildBoard();
    attachKeyboard();
    document.addEventListener("keydown", handleKeyDown);

    const saved = loadSavedState();
    if (saved && saved.savedDate === getTodayStr()) {
      restoreState(saved);
    } else {
      clearSavedState();
    }
  }

  // ── Selección de palabra diaria ────────────────────────────
  function getDailyWord() {
    const start   = new Date(START_DATE);
    const today   = new Date();
    start.setHours(0,0,0,0);
    today.setHours(0,0,0,0);
    const diffMs  = today - start;
    const diffDay = Math.floor(diffMs / 86400000);
    const index   = ((diffDay % DAILY_WORDS.length) + DAILY_WORDS.length) % DAILY_WORDS.length;
    return { index, solution: DAILY_WORDS[index] };
  }

  function getTodayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  // ── Board ──────────────────────────────────────────────────
  function buildBoard() {
    const board = document.getElementById("board");
    board.innerHTML = "";
    for (let r = 0; r < MAX_GUESSES; r++) {
      for (let c = 0; c < WORD_LENGTH; c++) {
        const tile = document.createElement("div");
        tile.classList.add("tile");
        tile.id = `tile-${r}-${c}`;
        board.appendChild(tile);
      }
    }
  }

  function getTile(row, col) {
    return document.getElementById(`tile-${row}-${col}`);
  }

  // ── Teclado ────────────────────────────────────────────────
  function attachKeyboard() {
    document.querySelectorAll("#keyboard button").forEach(btn => {
      btn.addEventListener("click", () => handleKey(btn.dataset.key));
    });
  }

  function handleKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.toUpperCase();
    if (key === "ENTER")     return handleKey("ENTER");
    if (key === "BACKSPACE") return handleKey("BACKSPACE");
    if (/^[A-ZÁÉÍÓÚÑÜ]$/.test(key)) handleKey(key);
  }

  function handleKey(key) {
    if (state.gameOver) return;
    if (key === "ENTER")     return submitGuess();
    if (key === "BACKSPACE") return deleteLetter();
    if (/^[A-ZÁÉÍÓÚÑÜ]$/.test(key)) typeLetter(key);
  }

  // ── Escritura ──────────────────────────────────────────────
  function typeLetter(letter) {
    if (state.currentCol >= WORD_LENGTH) return;
    const tile = getTile(state.currentRow, state.currentCol);
    tile.textContent = letter;
    tile.classList.add("filled");
    state.currentCol++;
  }

  function deleteLetter() {
    if (state.currentCol <= 0) return;
    state.currentCol--;
    const tile = getTile(state.currentRow, state.currentCol);
    tile.textContent = "";
    tile.classList.remove("filled");
  }

  // ── Submit ─────────────────────────────────────────────────
  function submitGuess() {
    if (state.currentCol < WORD_LENGTH) {
      showToast("Faltan letras");
      shakeRow(state.currentRow);
      return;
    }

    let guess = "";
    for (let c = 0; c < WORD_LENGTH; c++) {
      guess += getTile(state.currentRow, c).textContent;
    }

    if (!ALL_VALID_WORDS.includes(guess)) {
      showToast("Palabra no válida");
      shakeRow(state.currentRow);
      return;
    }

    state.guesses.push(guess);
    const result = evaluateGuess(guess);
    revealRow(state.currentRow, guess, result, () => {
      updateKeyboard(guess, result);
      const won = guess === state.solution;
      if (won) {
        state.gameOver = true;
        state.won = true;
        bounceRow(state.currentRow);
        setTimeout(() => {
          const msgs = ["¡Brillante!","¡Increíble!","¡Magnífico!","¡Genial!","¡Bien hecho!","¡Uf, por poco!"];
          showToast(msgs[Math.min(state.currentRow, msgs.length - 1)], 2500);
          setTimeout(() => endGame(true, state.currentRow + 1), 1500);
        }, 300);
      } else {
        state.currentRow++;
        state.currentCol = 0;
        if (state.currentRow >= MAX_GUESSES) {
          state.gameOver = true;
          state.won = false;
          setTimeout(() => {
            showToast(state.solution, 4000);
            setTimeout(() => endGame(false, null), 2000);
          }, 300);
        }
      }
      saveState();
    });
  }

  // ── Evaluación ─────────────────────────────────────────────
  function evaluateGuess(guess) {
    const result   = Array(WORD_LENGTH).fill("absent");
    const solArr   = state.solution.split("");
    const guestArr = guess.split("");
    const used     = Array(WORD_LENGTH).fill(false);

    // 1ª pasada: correctos
    for (let i = 0; i < WORD_LENGTH; i++) {
      if (guestArr[i] === solArr[i]) {
        result[i] = "correct";
        used[i]   = true;
        solArr[i] = null;
      }
    }
    // 2ª pasada: presentes
    for (let i = 0; i < WORD_LENGTH; i++) {
      if (result[i] === "correct") continue;
      const idx = solArr.findIndex((l, j) => l === guestArr[i] && !used[j]);
      if (idx !== -1) {
        result[i]    = "present";
        used[idx]    = true;
        solArr[idx]  = null;
      }
    }
    return result;
  }

  // ── Animaciones ────────────────────────────────────────────
  function revealRow(row, guess, result, callback) {
    for (let c = 0; c < WORD_LENGTH; c++) {
      const tile = getTile(row, c);
      const delay = c * FLIP_DELAY;
      setTimeout(() => {
        tile.classList.add("revealed", result[c]);
      }, delay);
    }
    const total = (WORD_LENGTH - 1) * FLIP_DELAY + FLIP_DURATION;
    setTimeout(callback, total);
  }

  function shakeRow(row) {
    for (let c = 0; c < WORD_LENGTH; c++) {
      const tile = getTile(row, c);
      tile.classList.remove("shake");
      void tile.offsetWidth;
      tile.classList.add("shake");
      tile.addEventListener("animationend", () => tile.classList.remove("shake"), { once: true });
    }
  }

  function bounceRow(row) {
    for (let c = 0; c < WORD_LENGTH; c++) {
      const tile = getTile(row, c);
      setTimeout(() => {
        tile.classList.add("bounce");
        tile.addEventListener("animationend", () => tile.classList.remove("bounce"), { once: true });
      }, c * 100);
    }
  }

  // ── Teclado colores ────────────────────────────────────────
  function updateKeyboard(guess, result) {
    const priority = { correct: 3, present: 2, absent: 1 };
    for (let i = 0; i < WORD_LENGTH; i++) {
      const letter = guess[i];
      const btn = document.querySelector(`#keyboard button[data-key="${letter}"]`);
      if (!btn) continue;
      const current = btn.dataset.state || "";
      if ((priority[result[i]] || 0) > (priority[current] || 0)) {
        btn.classList.remove("correct","present","absent");
        btn.classList.add(result[i]);
        btn.dataset.state = result[i];
      }
    }
  }

  // ── End Game ───────────────────────────────────────────────
  function endGame(won, attempts) {
    updateStats(won, attempts);
    openModal("modal-stats");
    startCountdown();
  }

  // ── Toast ──────────────────────────────────────────────────
  let toastTimer;
  function showToast(msg, duration = 1500) {
    const t = document.getElementById("toast");
    clearTimeout(toastTimer);
    t.textContent = msg;
    t.classList.remove("hidden");
    toastTimer = setTimeout(() => t.classList.add("hidden"), duration);
  }

  // ── Modals ─────────────────────────────────────────────────
  window.openModal  = function(id) { document.getElementById(id).classList.remove("hidden"); };
  window.closeModal = function(id) { document.getElementById(id).classList.add("hidden"); };

  // Cerrar al clicar fuera
  document.querySelectorAll(".modal").forEach(m => {
    m.addEventListener("click", e => { if (e.target === m) closeModal(m.id); });
  });

  // ── Stats ──────────────────────────────────────────────────
  function loadStats() {
    try {
      const saved = JSON.parse(localStorage.getItem(STATS_KEY));
      if (saved) stats = { ...stats, ...saved };
    } catch (_) {}
  }

  function saveStats() {
    try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch (_) {}
  }

  function updateStats(won, attempts) {
    stats.played++;
    if (won) {
      stats.wins++;
      stats.streak++;
      if (stats.streak > stats.maxStreak) stats.maxStreak = stats.streak;
      if (attempts) stats.dist[attempts] = (stats.dist[attempts] || 0) + 1;
    } else {
      stats.streak = 0;
    }
    saveStats();
    renderStats(won ? attempts : null);
  }

  function renderStats(highlightRow) {
    document.getElementById("stat-played").textContent  = stats.played;
    document.getElementById("stat-win").textContent     = stats.played ? Math.round(stats.wins / stats.played * 100) : 0;
    document.getElementById("stat-streak").textContent  = stats.streak;
    document.getElementById("stat-max-streak").textContent = stats.maxStreak;

    const container = document.getElementById("guess-distribution");
    container.innerHTML = "";
    const maxVal = Math.max(1, ...Object.values(stats.dist));
    for (let i = 1; i <= MAX_GUESSES; i++) {
      const val = stats.dist[i] || 0;
      const pct = Math.round((val / maxVal) * 100);
      const row = document.createElement("div");
      row.classList.add("dist-row");
      row.innerHTML = `
        <span class="dist-label">${i}</span>
        <div class="dist-bar-wrap">
          <div class="dist-bar ${i === highlightRow ? "highlight" : ""}" style="width:${Math.max(pct,7)}%">${val}</div>
        </div>`;
      container.appendChild(row);
    }

    document.getElementById("next-word-container").classList.remove("hidden");
  }

  // Abre modal de stats mostrando datos actuales (sin registrar nueva partida)
  const statsBtn = document.querySelector('[onclick="openModal(\'modal-stats\')"]');
  if (statsBtn) {
    statsBtn.addEventListener("click", () => {
      renderStats(null);
      if (state.gameOver) startCountdown();
    }, { capture: true });
  }

  // ── Countdown ─────────────────────────────────────────────
  let countdownTimer;
  function startCountdown() {
    clearInterval(countdownTimer);
    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  function tick() {
    const now      = new Date();
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    const diff = midnight - now;
    const h = String(Math.floor(diff / 3600000)).padStart(2, "0");
    const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, "0");
    const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, "0");
    const el = document.getElementById("countdown");
    if (el) el.textContent = `${h}:${m}:${s}`;
  }

  // ── Persistencia ───────────────────────────────────────────
  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, savedDate: getTodayStr() }));
    } catch (_) {}
  }

  function loadSavedState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (_) { return null; }
  }

  function clearSavedState() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
  }

  function restoreState(saved) {
    state = { ...state, ...saved };
    // Repintar tablero
    for (let r = 0; r < saved.guesses.length; r++) {
      const guess  = saved.guesses[r];
      const result = evaluateGuess(guess);
      for (let c = 0; c < WORD_LENGTH; c++) {
        const tile = getTile(r, c);
        tile.textContent = guess[c];
        tile.classList.add("filled", "revealed", result[c]);
      }
      updateKeyboard(guess, result);
    }
    if (state.gameOver) {
      if (state.won) showToast("¡Ya ganaste hoy! 🎉", 3000);
      else showToast(state.solution, 4000);
      renderStats(state.won ? state.guesses.length : null);
      startCountdown();
    }
  }

  // ── Arranque ───────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", init);

})();
