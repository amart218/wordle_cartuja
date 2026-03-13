// =============================================================
//  game.js — Lógica principal de WORDLE ES
//  Flujo anti-trampa:
//  1. Carga palabra → pide nombre → empieza partida
//  2. Al terminar → guarda resultado automáticamente
// =============================================================

(function () {
  "use strict";

  const WORD_LENGTH   = 5;
  const MAX_GUESSES   = 6;
  const FLIP_DURATION = 500;
  const FLIP_DELAY    = 300;
  const STORAGE_KEY   = "wordlees_state";
  const STATS_KEY     = "wordlees_stats";
  const CACHE_KEY     = "wordlees_wordcache";
  const PLAYER_KEY    = "wordlees_player";

  // ► Pega aquí la URL de tu Google Apps Script desplegado
  const DAILY_API_URL  = "https://script.google.com/macros/s/AKfycbws__uaT3FV_fjZAUu2rRlLakIge42uk9HqYdgNeHb--w7d5iFmY4dYSfwGM7yQ1-FnhA/exec";
  const WIKTIONARY_API = "https://es.wiktionary.org/w/api.php";

  // Genera todas las variantes acentuadas posibles de una palabra.
  // Wiktionary solo reconoce la forma CON tilde (fácil, balón...),
  // así que si el jugador escribe sin tilde hay que probar todas
  // las combinaciones posibles de vocales acentuadas.
  // Ejemplo: "facil" → ["facil","fácil","facíl","fácíl",...]
  function accentVariants(word) {
    const map = { a:["a","á"], e:["e","é"], i:["i","í"], o:["o","ó"], u:["u","ú"] };
    let variants = [word];
    for (let i = 0; i < word.length; i++) {
      const ch = word[i];
      if (!map[ch]) continue;
      const next = [];
      for (const v of variants) {
        for (const acc of map[ch]) {
          next.push(v.slice(0, i) + acc + v.slice(i + 1));
        }
      }
      variants = next;
    }
    // Eliminar duplicados y devolver array único
    return [...new Set(variants)];
  }

  // ── Caché de validación ────────────────────────────────────
  let wordCache = {};

  function loadCache() {
    try { const r = sessionStorage.getItem(CACHE_KEY); if (r) wordCache = JSON.parse(r); } catch (_) {}
  }
  function saveCache() {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(wordCache)); } catch (_) {}
  }

  // ── Estado ─────────────────────────────────────────────────
  let state = {
    solution  : "",
    playerName: "",
    guesses   : [],
    currentRow: 0,
    currentCol: 0,
    gameOver  : false,
    won       : false,
    savedDate : "",
    locked    : false,
    resultSent: false,
    elapsedSecs: 0,
  };

  let stats = {
    played: 0, wins: 0, streak: 0, maxStreak: 0,
    dist: { 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 },
  };

  // ── Cronómetro ─────────────────────────────────────────────
  let startTime = null;

  function startTimer()  { startTime = Date.now(); }
  function stopTimer()   {
    if (!startTime) return state.elapsedSecs || 0;
    state.elapsedSecs = Math.floor((Date.now() - startTime) / 1000);
    startTime = null;
    return state.elapsedSecs;
  }
  function formatTime(s) {
    const m = Math.floor(s / 60), sec = s % 60;
    return m > 0 ? `${m}m ${String(sec).padStart(2,"0")}s` : `${sec}s`;
  }

  // ── Init ───────────────────────────────────────────────────
  async function init() {
    loadCache();
    loadStats();
    buildBoard();
    attachKeyboard();
    document.addEventListener("keydown", handleKeyDown);
    showLoadingScreen(true);

    try {
      const solution = await fetchDailyWord();
      state.solution = solution;
      showLoadingScreen(false);

      const saved = loadSavedState();
      if (saved && saved.savedDate === getTodayStr()) {
        // Partida ya iniciada hoy — restaurar sin pedir nombre
        restoreState(saved);
      } else {
        // Partida nueva — pedir nombre antes de empezar
        clearSavedState();
        askPlayerName();
      }
    } catch (err) {
      showLoadingScreen(false);
      showError("No se pudo cargar la palabra de hoy. Inténtalo de nuevo.");
      console.error(err);
    }
  }

  // ── Fetch palabra diaria ───────────────────────────────────
  async function fetchDailyWord() {
    const cached = loadSavedState();
    if (cached && cached.savedDate === getTodayStr() && cached.solution) return cached.solution;
    const res  = await fetch(DAILY_API_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.word) throw new Error("Respuesta inválida");
    return data.word.toUpperCase().trim();
  }

  // ── Pedir nombre ANTES de jugar ────────────────────────────
  function askPlayerName() {
    const savedName = localStorage.getItem(PLAYER_KEY) || "";
    const input     = document.getElementById("player-name-input");
    const subtitle  = document.getElementById("register-subtitle");

    if (input) input.value = savedName;
    if (subtitle) subtitle.textContent = "Introduce tu nombre para comenzar. Tu resultado se guardará automáticamente al terminar.";

    // Ocultar botón "Saltar" — obligatorio registrarse antes de jugar
    const skipBtn = document.getElementById("btn-skip-register");
    if (skipBtn) skipBtn.classList.add("hidden");

    document.getElementById("btn-register").onclick = () => {
      const name = (input?.value || "").trim();
      if (!name) { input?.focus(); showToast("Escribe tu nombre para continuar"); return; }
      localStorage.setItem(PLAYER_KEY, name);
      state.playerName = name;
      closeModal("modal-register");
      startTimer();
      saveState(); // guarda el nombre en el estado desde el inicio
    };

    openModal("modal-register");
  }

  // ── UI auxiliar ────────────────────────────────────────────
  function showLoadingScreen(v) {
    const el = document.getElementById("loading-screen");
    if (el) el.classList.toggle("hidden", !v);
  }
  function showError(msg) {
    const el = document.getElementById("error-screen");
    if (!el) return;
    el.querySelector(".error-msg").textContent = msg;
    el.classList.remove("hidden");
  }
  function getTodayStr() { return new Date().toISOString().slice(0,10); }

  // ── Board ──────────────────────────────────────────────────
  function buildBoard() {
    const board = document.getElementById("board");
    board.innerHTML = "";
    for (let r = 0; r < MAX_GUESSES; r++)
      for (let c = 0; c < WORD_LENGTH; c++) {
        const t = document.createElement("div");
        t.classList.add("tile");
        t.id = `tile-${r}-${c}`;
        board.appendChild(t);
      }
  }
  function getTile(r, c) { return document.getElementById(`tile-${r}-${c}`); }

  // ── Teclado ────────────────────────────────────────────────
  function attachKeyboard() {
    document.querySelectorAll("#keyboard button").forEach(btn =>
      btn.addEventListener("click", () => handleKey(btn.dataset.key))
    );
  }
  function handleKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toUpperCase();
    if (k === "ENTER") return handleKey("ENTER");
    if (k === "BACKSPACE") return handleKey("BACKSPACE");
    if (/^[A-ZÁÉÍÓÚÑÜ]$/.test(k)) handleKey(k);
  }
  function handleKey(key) {
    // Bloquear si no hay nombre registrado aún
    if (!state.playerName && !state.gameOver) return;
    if (state.gameOver || state.locked || !state.solution) return;
    if (key === "ENTER")     return submitGuess();
    if (key === "BACKSPACE") return deleteLetter();
    if (/^[A-ZÁÉÍÓÚÑÜ]$/.test(key)) typeLetter(key);
  }

  // ── Escritura ──────────────────────────────────────────────
  function typeLetter(letter) {
    if (state.currentCol >= WORD_LENGTH) return;
    const t = getTile(state.currentRow, state.currentCol);
    t.textContent = letter;
    t.classList.add("filled");
    state.currentCol++;
  }
  function deleteLetter() {
    if (state.currentCol <= 0) return;
    state.currentCol--;
    const t = getTile(state.currentRow, state.currentCol);
    t.textContent = "";
    t.classList.remove("filled");
  }

  // ── Submit ─────────────────────────────────────────────────
  async function submitGuess() {
    if (state.currentCol < WORD_LENGTH) { showToast("Faltan letras"); shakeRow(state.currentRow); return; }

    let guess = "";
    for (let c = 0; c < WORD_LENGTH; c++) guess += getTile(state.currentRow, c).textContent;

    state.locked = true;
    setLoadingRow(state.currentRow, true);
    const valid = await isValidWord(guess);
    setLoadingRow(state.currentRow, false);
    state.locked = false;

    if (!valid) { showToast("Palabra no encontrada"); shakeRow(state.currentRow); return; }

    state.guesses.push(guess);
    const result = evaluateGuess(guess);

    revealRow(state.currentRow, guess, result, () => {
      updateKeyboard(guess, result);
      const won = guess === state.solution;

      if (won) {
        state.gameOver = true;
        state.won      = true;
        const secs     = stopTimer();
        bounceRow(state.currentRow);
        setTimeout(() => {
          const msgs = ["¡Brillante!","¡Increíble!","¡Magnífico!","¡Genial!","¡Bien hecho!","¡Uf, por poco!"];
          showToast(msgs[Math.min(state.currentRow, msgs.length - 1)], 2500);
          setTimeout(() => endGame(true, state.currentRow + 1, secs), 1500);
        }, 300);
      } else {
        state.currentRow++;
        state.currentCol = 0;
        if (state.currentRow >= MAX_GUESSES) {
          state.gameOver = true;
          state.won      = false;
          const secs     = stopTimer();
          setTimeout(() => {
            showToast(state.solution, 4000);
            setTimeout(() => endGame(false, null, secs), 2000);
          }, 300);
        }
      }
      saveState();
    });
  }

  // ── Validación Wiktionary ──────────────────────────────────
  async function isValidWord(word) {
    const n = word.toLowerCase();
    if (n in wordCache) return wordCache[n];

    // Genera todas las variantes acentuadas (máx. 2^5 = 32 para 5 vocales)
    const variants = accentVariants(n);

    try {
      // Wiktionary permite consultar varias páginas en una sola llamada
      // usando el parámetro titles con "|" como separador
      const p = new URLSearchParams({
        action: "query",
        titles: variants.join("|"),
        format: "json",
        origin: "*",
      });
      const res  = await fetch(`${WIKTIONARY_API}?${p}`);
      if (!res.ok) throw new Error();
      const data  = await res.json();
      const pages = Object.values(data?.query?.pages ?? {});
      // Si alguna variante existe (pageid positivo) → válida
      const found = pages.some(page => !("missing" in page));
      // Guardar resultado en caché para la forma original
      wordCache[n] = found;
      saveCache();
      return found;
    } catch (_) { return true; }
  }

  function setLoadingRow(row, loading) {
    for (let c = 0; c < WORD_LENGTH; c++) getTile(row, c).classList.toggle("loading", loading);
  }

  // ── Evaluación ─────────────────────────────────────────────
  function evaluateGuess(guess) {
    const result = Array(WORD_LENGTH).fill("absent");
    const sol    = state.solution.split("");
    const g      = guess.split("");
    const used   = Array(WORD_LENGTH).fill(false);
    for (let i = 0; i < WORD_LENGTH; i++) {
      if (g[i] === sol[i]) { result[i] = "correct"; used[i] = true; sol[i] = null; }
    }
    for (let i = 0; i < WORD_LENGTH; i++) {
      if (result[i] === "correct") continue;
      const idx = sol.findIndex((l, j) => l === g[i] && !used[j]);
      if (idx !== -1) { result[i] = "present"; used[idx] = true; sol[idx] = null; }
    }
    return result;
  }

  // ── End Game ───────────────────────────────────────────────
  function endGame(won, attempts, secs) {
    updateStats(won, attempts);
    // Envío automático — el nombre ya está registrado desde el inicio
    if (!state.resultSent) {
      submitResult(state.playerName, won, attempts, secs);
    }
    openModal("modal-stats");
    startCountdown();
  }

  // ── Enviar resultado a Google Sheets (automático) ──────────
  async function submitResult(name, won, attempts, secs) {
    try {
      const params = new URLSearchParams({
        action  : "register",
        player  : name || "Anónimo",
        date    : getTodayStr(),
        word    : state.solution,
        won     : won ? "1" : "0",
        attempts: attempts || 0,
        seconds : secs || 0,
      });
      await fetch(`${DAILY_API_URL}?${params}`);
      state.resultSent = true;
      saveState();
    } catch (err) {
      console.warn("No se pudo guardar el resultado:", err);
      // Silencioso: no interrumpir la experiencia del jugador
    }
  }

  // ── Animaciones ────────────────────────────────────────────
  function revealRow(row, guess, result, cb) {
    for (let c = 0; c < WORD_LENGTH; c++)
      setTimeout(() => getTile(row, c).classList.add("revealed", result[c]), c * FLIP_DELAY);
    setTimeout(cb, (WORD_LENGTH - 1) * FLIP_DELAY + FLIP_DURATION);
  }
  function shakeRow(row) {
    for (let c = 0; c < WORD_LENGTH; c++) {
      const t = getTile(row, c);
      t.classList.remove("shake"); void t.offsetWidth; t.classList.add("shake");
      t.addEventListener("animationend", () => t.classList.remove("shake"), { once: true });
    }
  }
  function bounceRow(row) {
    for (let c = 0; c < WORD_LENGTH; c++) {
      const t = getTile(row, c);
      setTimeout(() => {
        t.classList.add("bounce");
        t.addEventListener("animationend", () => t.classList.remove("bounce"), { once: true });
      }, c * 100);
    }
  }

  // ── Teclado colores ────────────────────────────────────────
  function updateKeyboard(guess, result) {
    const pri = { correct:3, present:2, absent:1 };
    for (let i = 0; i < WORD_LENGTH; i++) {
      const btn = document.querySelector(`#keyboard button[data-key="${guess[i]}"]`);
      if (!btn) continue;
      const cur = btn.dataset.state || "";
      if ((pri[result[i]]||0) > (pri[cur]||0)) {
        btn.classList.remove("correct","present","absent");
        btn.classList.add(result[i]);
        btn.dataset.state = result[i];
      }
    }
  }

  // ── Toast ──────────────────────────────────────────────────
  let toastTimer;
  function showToast(msg, dur = 1500) {
    const t = document.getElementById("toast");
    clearTimeout(toastTimer);
    t.textContent = msg; t.classList.remove("hidden");
    toastTimer = setTimeout(() => t.classList.add("hidden"), dur);
  }

  // ── Modals ─────────────────────────────────────────────────
  window.openModal  = id => document.getElementById(id).classList.remove("hidden");
  window.closeModal = id => document.getElementById(id).classList.add("hidden");
  document.querySelectorAll(".modal").forEach(m =>
    m.addEventListener("click", e => { if (e.target === m) closeModal(m.id); })
  );

  // ── Stats ──────────────────────────────────────────────────
  function loadStats() {
    try { const s = JSON.parse(localStorage.getItem(STATS_KEY)); if (s) stats = {...stats,...s}; } catch(_){}
  }
  function saveStats() {
    try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch(_){}
  }
  function updateStats(won, attempts) {
    stats.played++;
    if (won) {
      stats.wins++; stats.streak++;
      if (stats.streak > stats.maxStreak) stats.maxStreak = stats.streak;
      if (attempts) stats.dist[attempts] = (stats.dist[attempts]||0) + 1;
    } else { stats.streak = 0; }
    saveStats();
    renderStats(won ? attempts : null);
  }
  function renderStats(hi) {
    document.getElementById("stat-played").textContent     = stats.played;
    document.getElementById("stat-win").textContent        = stats.played ? Math.round(stats.wins/stats.played*100) : 0;
    document.getElementById("stat-streak").textContent     = stats.streak;
    document.getElementById("stat-max-streak").textContent = stats.maxStreak;
    const c = document.getElementById("guess-distribution");
    c.innerHTML = "";
    const mx = Math.max(1, ...Object.values(stats.dist));
    for (let i = 1; i <= MAX_GUESSES; i++) {
      const v = stats.dist[i]||0, pct = Math.round(v/mx*100);
      const row = document.createElement("div");
      row.classList.add("dist-row");
      row.innerHTML = `<span class="dist-label">${i}</span>
        <div class="dist-bar-wrap">
          <div class="dist-bar ${i===hi?"highlight":""}" style="width:${Math.max(pct,7)}%">${v}</div>
        </div>`;
      c.appendChild(row);
    }
    document.getElementById("next-word-container").classList.remove("hidden");
  }

  const statsBtn = document.querySelector('[onclick="openModal(\'modal-stats\')"]');
  if (statsBtn) statsBtn.addEventListener("click", () => {
    renderStats(null);
    if (state.gameOver) startCountdown();
  }, { capture: true });

  // ── Countdown ─────────────────────────────────────────────
  let countdownTimer;
  function startCountdown() { clearInterval(countdownTimer); tick(); countdownTimer = setInterval(tick,1000); }
  function tick() {
    const now = new Date(), mid = new Date();
    mid.setHours(24,0,0,0);
    const d = mid - now;
    const h = String(Math.floor(d/3600000)).padStart(2,"0");
    const m = String(Math.floor((d%3600000)/60000)).padStart(2,"0");
    const s = String(Math.floor((d%60000)/1000)).padStart(2,"0");
    const el = document.getElementById("countdown");
    if (el) el.textContent = `${h}:${m}:${s}`;
  }

  // ── Persistencia ───────────────────────────────────────────
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({...state, savedDate: getTodayStr()})); } catch(_){}
  }
  function loadSavedState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch(_) { return null; }
  }
  function clearSavedState() {
    try { localStorage.removeItem(STORAGE_KEY); } catch(_){}
  }

  function restoreState(saved) {
    const solution = state.solution;
    state = { ...state, ...saved, solution };

    for (let r = 0; r < saved.guesses.length; r++) {
      const guess = saved.guesses[r], result = evaluateGuess(guess);
      for (let c = 0; c < WORD_LENGTH; c++) {
        const t = getTile(r, c);
        t.textContent = guess[c];
        t.classList.add("filled","revealed",result[c]);
      }
      updateKeyboard(guess, result);
    }

    if (state.gameOver) {
      if (state.won) showToast("¡Ya ganaste hoy! 🎉", 3000);
      else showToast(state.solution, 4000);
      renderStats(state.won ? state.guesses.length : null);
      startCountdown();
    } else if (!state.playerName) {
      // Caso raro: hay estado guardado pero sin nombre → pedir nombre
      askPlayerName();
    } else {
      // Continuar partida en curso
      startTimer();
    }
  }

  document.addEventListener("DOMContentLoaded", init);

})();
