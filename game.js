"use strict";

/* ============================================================
   Betinho - Aventura
   Plataforma 2D estilo Mario. Canvas + JS puro, sem libs.
   ============================================================ */

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = canvas.width;   // 960 (espaço lógico)
const H = canvas.height;  // 540
ctx.imageSmoothingEnabled = false;

/* ---------- Sprites do Betinho ----------
   frente/qFrente: 1280x720 com fundo transparente; sx/sy/sw/sh recortam só o cachorro.
   correr/luta: recortes já isolados (fundo transparente, sw/sh = tamanho real do arquivo). */
function sprFrame(src, sw, sh) {
  const im = { img: new Image(), sx: 0, sy: 0, sw, sh };
  im.img.src = src;
  return im;
}
const SPR = {
  frente: { img: new Image(), sx: 475, sy: 137, sw: 325, sh: 430 }, // parado / pulo
  qFrente: { img: new Image(), sx: 504, sy: 183, sw: 265, sh: 355 }, // Quindim parado / pulo
  bCorrer: [
    sprFrame("assets/betinho-correr1.png", 219, 153),
    sprFrame("assets/betinho-correr2.png", 242, 154),
    sprFrame("assets/betinho-correr3.png", 224, 154),
    sprFrame("assets/betinho-correr4.png", 214, 151),
  ],
  qCorrer: [
    sprFrame("assets/quindim-correr1.png", 215, 149),
    sprFrame("assets/quindim-correr2.png", 246, 144),
    sprFrame("assets/quindim-correr3.png", 210, 150),
    sprFrame("assets/quindim-correr4.png", 217, 142),
  ],
  bLuta: {
    idle: sprFrame("assets/betinho-luta-idle.png", 159, 220),
    ataque: sprFrame("assets/betinho-luta-ataque.png", 229, 213),
    especial: sprFrame("assets/betinho-luta-especial.png", 270, 180),
  },
  qLuta: {
    idle: sprFrame("assets/quindim-luta-idle.png", 192, 211),
    ataque: sprFrame("assets/quindim-luta-ataque.png", 215, 210),
    especial: sprFrame("assets/quindim-luta-especial.png", 258, 165),
  },
};
SPR.frente.img.src = "assets/betinho-frente.png";
SPR.qFrente.img.src = "assets/quindim-frente.png";

/* ---------- Entrada de teclado ---------- */
const keys = { left: false, right: false, jump: false, down: false, dash: false };
const touch = { left: false, right: false, jump: false, down: false, dash: false };
const touchPointers = new Map();
const heldKeys = new Set();
let inputActive = true;
let jumpPressed = false; // borda de subida do pulo
let downPressed = false; // borda de subida do ↓ (dispara o ground pound no ar)
let dashPressed = false; // borda de subida do dash
let punchPressed = false; // borda de subida do soco (Z / gamepad B)
let kickPressed = false;  // borda de subida do chute (Y / gamepad Y)
let menuUpPressed = false, menuDownPressed = false; // navegação no menu de Opções
let confirmPressed = false; // Espaço como "confirmar" no menu (separado do pulo, pra não confirmar junto com navegar)
let anyKey = false;      // para telas de "aperte para continuar"

function setKey(e, down) {
  if (down && !inputActive) return;
  if (down && e.repeat) {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(e.code)) e.preventDefault();
    return;
  }
  if (down) heldKeys.add(e.code);
  else heldKeys.delete(e.code);
  if (down) Sound.ensure(); // 1º toque destrava o áudio (política de autoplay)
  switch (e.code) {
    case "ArrowLeft":  keys.left = down; break;
    case "ArrowRight": keys.right = down; break;
    case "ArrowDown":
      if (down && !keys.down) { downPressed = true; menuDownPressed = true; }
      keys.down = down;
      break;
    case "ArrowUp":
      if (down && !keys.jump) { jumpPressed = true; menuUpPressed = true; }
      keys.jump = heldKeys.has("ArrowUp") || heldKeys.has("Space");
      break;
    case "Space":
      if (down && !keys.jump) { jumpPressed = true; confirmPressed = true; }
      keys.jump = heldKeys.has("ArrowUp") || heldKeys.has("Space");
      break;
    case "KeyZ":
      if (down) punchPressed = true;
      break;
    case "KeyX":
    case "ShiftLeft":
    case "ShiftRight":
      if (down && !keys.dash) dashPressed = true;
      keys.dash = heldKeys.has("KeyX") || heldKeys.has("ShiftLeft") || heldKeys.has("ShiftRight");
      break;
    case "KeyY":
      if (down && modeInfo().isArena) kickPressed = true;
      break;
    case "Enter":
      if (down) anyKey = true;
      break;
    case "KeyO":
      if (down) {
        if (state === STATE.TITLE) { state = STATE.OPTIONS; optionsFocus = 0; Sound.blip(520, 0.06); }
        else if (state === STATE.OPTIONS) { state = STATE.TITLE; Sound.blip(400, 0.06); }
      }
      break;
    case "KeyM":
      if (down) { Sound.muted = !Sound.muted; if (!Sound.muted) Sound.blip(660, 0.08); saveMuted(); }
      break;
    case "KeyG":
      if (down) padDebug = !padDebug; // painel de diagnóstico do controle
      break;
    case "KeyP":
    case "Escape":
      if (down) {
        if (state === STATE.OPTIONS) state = STATE.TITLE;
        else togglePause();
      }
      break;
    default:
      return; // não previne outras teclas
  }
  // evita rolar a página com setas / espaço
  if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Space"].includes(e.code)) {
    e.preventDefault();
  }
}
window.addEventListener("keydown", (e) => setKey(e, true));
window.addEventListener("keyup",   (e) => setKey(e, false));

function releaseTouch(pointerId) {
  const entry = touchPointers.get(pointerId);
  if (!entry) return;
  touchPointers.delete(pointerId);
  if (entry.button?.releasePointerCapture) {
    try { entry.button.releasePointerCapture(pointerId); } catch (_) {}
  }
  if (entry.action in touch) {
    touch[entry.action] = [...touchPointers.values()].some(item => item.action === entry.action);
    if (!touch[entry.action]) entry.button?.classList.remove("is-held");
  }
}

function pressTouch(action, e) {
  if (!inputActive || touchPointers.has(e.pointerId)) return;
  e.preventDefault();
  const button = e.currentTarget;
  touchPointers.set(e.pointerId, { action, button });
  if (button.setPointerCapture) {
    try { button.setPointerCapture(e.pointerId); } catch (_) {}
  }
  Sound.ensure();
  if (action === "pause") {
    togglePause();
    return;
  }
  if (action in touch) {
    if (!touch[action]) {
      touch[action] = true;
      button.classList.add("is-held");
      if (action === "jump") {
        jumpPressed = true;
        confirmPressed = true;
        anyKey = true;
      } else if (action === "down") {
        downPressed = true;
        menuDownPressed = true;
      } else if (action === "dash") {
        dashPressed = true;
      }
    }
  } else if (action === "punch") {
    punchPressed = true;
  } else if (action === "kick") {
    kickPressed = true;
  }
}

const touchButtons = typeof document.querySelectorAll === "function"
  ? document.querySelectorAll("[data-touch-action]") : [];
for (const button of touchButtons) {
  const action = button.dataset.touchAction;
  button.addEventListener("pointerdown", e => pressTouch(action, e));
  button.addEventListener("pointerup", e => releaseTouch(e.pointerId));
  button.addEventListener("pointercancel", e => releaseTouch(e.pointerId));
  button.addEventListener("lostpointercapture", e => releaseTouch(e.pointerId));
}

function clearTouchInput() {
  for (const entry of touchPointers.values()) entry.button?.classList.remove("is-held");
  touchPointers.clear();
  for (const action of Object.keys(touch)) touch[action] = false;
}

function suspendInput() {
  inputActive = false;
  heldKeys.clear();
  for (const key of Object.keys(keys)) keys[key] = false;
  for (const key of Object.keys(pad)) pad[key] = false;
  clearTouchInput();
  jumpPressed = downPressed = dashPressed = punchPressed = kickPressed = false;
  menuUpPressed = menuDownPressed = confirmPressed = anyKey = false;
  if (state === STATE.PLAYING || state === STATE.INTERLUDE) togglePause();
}
window.addEventListener("blur", suspendInput);
window.addEventListener("focus", () => { inputActive = !document.hidden; });
document.addEventListener("visibilitychange", () => {
  if (document.hidden) suspendInput();
  else inputActive = document.hasFocus();
});

/* ---------- Som (Web Audio, sintetizado, sem arquivos) ---------- */
const Sound = {
  ctx: null,
  muted: false,
  ensure() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (_) { this.ctx = null; }
    }
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  },
  // toca uma nota simples com envelope
  tone(freq, dur, type = "square", vol = 0.18, delay = 0) {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  },
  // nota com glissando (sobe/desce de freq)
  slide(f1, f2, dur, type = "square", vol = 0.18, delay = 0) {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f1, t);
    osc.frequency.exponentialRampToValueAtTime(f2, t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  },
  blip(f, d) { this.tone(f, d, "square", 0.15); },
  jump()  { this.slide(320, 620, 0.16, "square", 0.16); },
  doubleJump() { this.slide(520, 920, 0.16, "square", 0.15); }, // mais agudo, "whoosh"
  dash() { this.slide(280, 680, 0.12, "square", 0.17); },
  groundPound() { this.slide(200, 60, 0.14, "sawtooth", 0.2); },
  poundLand() { this.tone(90, 0.14, "square", 0.22); this.tone(60, 0.18, "sawtooth", 0.18, 0.02); },
  hurt()  { this.slide(300, 90, 0.32, "sawtooth", 0.22); },
  stomp() { this.slide(700, 180, 0.12, "square", 0.2); },
  coin() { this.tone(988, 0.08, "square", 0.16); this.tone(1319, 0.10, "square", 0.16, 0.06); },
  oneUp() { [784, 1047, 1319, 1568].forEach((f, i) => this.tone(f, 0.12, "square", 0.18, i * 0.08)); },
  checkpoint() { [660, 990].forEach((f, i) => this.tone(f, 0.12, "square", 0.16, i * 0.08)); },
  levelUp() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.14, "square", 0.18, i * 0.09)); },
  gameover() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.28, "triangle", 0.22, i * 0.16)); },
  victory() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, 0.18, "square", 0.2, i * 0.13)); },
  powerup() { [392, 523, 659, 880, 1046].forEach((f, i) => this.tone(f, 0.10, "square", 0.18, i * 0.06)); },
  clue(kind) {
    const notes = { pegada: [392, 523], tufo: [523, 659], latido: [659, 784] };
    (notes[kind] || notes.pegada).forEach((f, i) => this.tone(f, 0.12, "triangle", 0.12, i * 0.08));
  },
  sentinel() { this.tone(110, 0.16, "sawtooth", 0.14); },
  echo() { this.slide(180, 70, 0.38, "sine", 0.11); },
  rustle() { this.tone(260, 0.08, "triangle", 0.08); this.tone(310, 0.08, "triangle", 0.06, 0.08); },
  punch() { this.slide(160, 60, 0.1, "sawtooth", 0.26); },
  kick() { this.slide(220, 80, 0.14, "sawtooth", 0.24); },
  ko() { this.slide(420, 50, 0.6, "sawtooth", 0.26); },
  bell() { this.tone(1500, 0.16, "sine", 0.2); this.tone(1500, 0.16, "sine", 0.2, 0.28); },

  // --- música de fundo (loop chiptune, agendado por passos) ---
  musicTimer: null,
  musicStep: 0,
  stepSec: 0.19,
  melody: [523, 659, 784, 659, 587, 698, 880, 698,
           659, 784, 988, 784, 523, 440, 392, 0],
  bass: [131, 165, 196, 147],
  startMusic(melody, bass, stepSec) {
    if (!this.ctx || this.musicTimer) return;
    this.melody = melody || this.melody; // sem args: retoma a última melodia tocada (usado no despausar)
    this.bass = bass || this.bass;
    stepSec = stepSec || this.stepSec;
    this.stepSec = stepSec;
    this.musicStep = 0;
    const tick = () => {
      if (!this.muted) {
        const s = this.musicStep;
        const f = this.melody[s % this.melody.length];
        if (f) this.tone(f, stepSec * 0.9, "triangle", 0.05);       // melodia suave
        if (s % 4 === 0) this.tone(this.bass[(s / 4) % this.bass.length], stepSec * 1.8, "sine", 0.06); // baixo
      }
      this.musicStep++;
    };
    this.musicTimer = setInterval(tick, stepSec * 1000);
    tick();
  },
  stopMusic() {
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
  },
};

/* ---------- Persistência local (um único save versionado) ----------
   Antes eram 5 chaves soltas sem versão (betinho_muted, betinho_bestLevel,
   betinho_replayInterlude, betinho_assist*). Consolidado em betinho_save
   com {version} para que corrida (melhores tempos, desbloqueios) adicione
   campos sem migração traumática. As chaves antigas ainda são lidas uma
   única vez e migradas. */
const SAVE_KEY = "betinho_save";

function persistSave() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      version: 1,
      muted: Sound.muted,
      bestLevel,
      replayInterlude: replayInterludeUnlocked,
      assist: { infiniteLives: assist.infiniteLives, noFallDeath: assist.noFallDeath },
    }));
  } catch (_) {}
}

let bestLevel = 1; // 1-based, só pra exibir na tela de título
let replayInterludeUnlocked = false;
let assist = { infiniteLives: false, noFallDeath: false };

/* carrega o save; se ausente ou sem versão, migra das chaves antigas */
function loadSave() {
  let migrated = false;
  const old = {
    muted: () => { try { return localStorage.getItem("betinho_muted") === "1"; } catch (_) { return false; } },
    bestLevel: () => { try { return parseInt(localStorage.getItem("betinho_bestLevel"), 10) || 1; } catch (_) { return 1; } },
    replayInterlude: () => { try { return localStorage.getItem("betinho_replayInterlude") === "1"; } catch (_) { return false; } },
    infLives: () => { try { return localStorage.getItem("betinho_assistInfLives") === "1"; } catch (_) { return false; } },
    noFall: () => { try { return localStorage.getItem("betinho_assistNoFall") === "1"; } catch (_) { return false; } },
  };
  let data = null;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) data = JSON.parse(raw);
  } catch (_) {}
  if (!data || !data.version) {
    data = {
      version: 1,
      muted: old.muted(),
      bestLevel: old.bestLevel(),
      replayInterlude: old.replayInterlude(),
      assist: { infiniteLives: old.infLives(), noFallDeath: old.noFall() },
    };
    migrated = true;
  }
  Sound.muted = !!data.muted;
  bestLevel = data.bestLevel >= 1 ? data.bestLevel : 1;
  replayInterludeUnlocked = !!data.replayInterlude;
  assist.infiniteLives = !!(data.assist && data.assist.infiniteLives);
  assist.noFallDeath = !!(data.assist && data.assist.noFallDeath);
  if (migrated) persistSave(); // grava o formato novo uma única vez
}

function saveMuted() { persistSave(); }
function saveBestLevel(n) {
  if (n > bestLevel) {
    bestLevel = n;
    persistSave();
  }
}
function saveReplayInterlude() {
  replayInterludeUnlocked = true;
  persistSave();
}
function saveAssist() { persistSave(); }
loadSave(); // carrega (ou migra) o save único na inicialização

/* ---------- Controle (Gamepad API) ----------
   Robusto a mappings não-padrão (GameSir/D-input etc.):
   - andar: analógico esquerdo (axes[0]) + D-pad (botões 14/15) + hat em eixo
   - pular: A(0) / B(1) na plataforma / D-pad cima(12) / analógico cima
   - confirmar telas: A(0) / B(1) / Start(9)
   - X(2) é o dash/esquiva; B(1) soco e Y(3) chute na arena.
   Tecla G abre o painel de diagnóstico. */
const pad = { left: false, right: false, down: false, jump: false };
const padPrev = { jump: false, confirm: false, start: false, down: false, up: false, dash: false, options: false, punch: false, kick: false };
const PAD_DEADZONE = 0.35;
let padInfo = null;    // snapshot p/ o painel de diagnóstico
let padDebug = false;  // liga/desliga o painel (tecla G)

function pollGamepad() {
  pad.left = false;
  pad.right = false;
  pad.down = false;
  pad.jump = false;
  let jumpHeld = false, confirm = false, startHeld = false, upHeld = false, dashHeld = false, optionsHeld = false, gpPunchHeld = false, gpKickHeld = false;

  let list = [];
  try { if (navigator.getGamepads) list = navigator.getGamepads() || []; }
  catch (_) { list = []; } // API bloqueada por permissions-policy em alguns contextos
  let gp = null;
  for (const g of list) { if (g && g.connected !== false) { gp = g; break; } }

  if (gp) {
    const ax = gp.axes || [];
    const b = gp.buttons || [];
    const down = (i) => !!(b[i] && b[i].pressed);
    const x = ax[0] || 0, y = ax[1] || 0;

    // snapshot p/ diagnóstico (id, mapping, eixos, botões pressionados)
    const pressed = [];
    for (let i = 0; i < b.length; i++) if (b[i] && b[i].pressed) pressed.push(i);
    padInfo = {
      id: String(gp.id || "").slice(0, 72),
      mapping: gp.mapping || "(vazio/não-padrão)",
      index: gp.index,
      axes: Array.from(ax, (a) => Math.round(a * 100) / 100),
      pressed,
    };

    // D-pad exposto como eixo "hat" (comum em mappings não-padrão)
    let hatL = false, hatR = false, hatD = false;
    if (ax.length >= 10) {
      const h = ax[9];
      if (h >= -1.05 && h <= 1.05 && Math.abs(h) > 0.05) {
        const dir = Math.round(((h + 1) / 2) * 8) % 8; // 0=cima,2=dir,4=baixo,6=esq
        if (dir === 1 || dir === 2 || dir === 3) hatR = true;
        if (dir === 5 || dir === 6 || dir === 7) hatL = true;
        if (dir === 3 || dir === 4 || dir === 5) hatD = true;
      }
    }

    if (x < -PAD_DEADZONE || down(14) || hatL) pad.left = true;
    if (x >  PAD_DEADZONE || down(15) || hatR) pad.right = true;
    if (y >  PAD_DEADZONE || down(13) || hatD) pad.down = true;
    const inFight = modeInfo().isArena;
    jumpHeld = down(0) || (!inFight && down(1)) || down(12) || (y < -PAD_DEADZONE);
    pad.jump = jumpHeld; // usado pra segurar o planar da Pena
    confirm  = down(0) || down(1) || down(9);
    startHeld = down(9);
    upHeld = down(12) || (y < -PAD_DEADZONE);
    dashHeld = down(2); // X (mapping padrão) — dash na plataforma / esquiva na arena
    optionsHeld = down(3);
    gpPunchHeld = inFight && down(1);
    gpKickHeld = inFight && down(3);
  } else {
    padInfo = null;
  }

  // bordas de subida (evita repetir enquanto segura)
  if (jumpHeld && !padPrev.jump) { jumpPressed = true; Sound.ensure(); }
  if (confirm && !padPrev.confirm) { anyKey = true; Sound.ensure(); }
  if (pad.down && !padPrev.down) { downPressed = true; menuDownPressed = true; }
  if (upHeld && !padPrev.up) { menuUpPressed = true; }
  if (dashHeld && !padPrev.dash) { dashPressed = true; Sound.ensure(); }
  if (optionsHeld && !padPrev.options) {
    if (state === STATE.TITLE) { state = STATE.OPTIONS; optionsFocus = 0; Sound.blip(520, 0.06); }
    else if (state === STATE.OPTIONS) { state = STATE.TITLE; Sound.blip(400, 0.06); }
  }
  if (startHeld && !padPrev.start) {
    Sound.ensure();
    if (state === STATE.OPTIONS) state = STATE.TITLE;
    else togglePause();
  }
  padPrev.jump = jumpHeld;
  padPrev.confirm = confirm;
  padPrev.start = startHeld;
  padPrev.down = pad.down;
  padPrev.up = upHeld;
  if (gpPunchHeld && !padPrev.punch) punchPressed = true;
  if (gpKickHeld && !padPrev.kick) kickPressed = true;
  padPrev.punch = gpPunchHeld;
  padPrev.kick = gpKickHeld;
  padPrev.dash = dashHeld;
  padPrev.options = optionsHeld;
}

/* ---------- Física (passo fixo 1/60s) ---------- */
const GRAVITY   = 0.6;
const MOVE_SPEED = 4.0;
const MAX_FALL  = 15.0;
const DASH_SPEED = 11.5, DASH_FRAMES = 10, DASH_COOLDOWN = 30; // investida horizontal breve
const GROUND_POUND_SPEED = 20, POUND_AOE_RADIUS = 60;          // mergulho rápido no ar
const PW = 42, PH = 46; // caixa de colisão do Betinho (forma grande; usada em start/respawn/checkpoints)

/* ---------- Formas do jogador (Betinho <-> Quindim) ---------- */
const FORM = {
  betinho: { w: 42, h: 46, jump: -12.0, frente: SPR.frente, correr: SPR.bCorrer, scaleFrente: 14, scaleCorrer: 6, luta: SPR.bLuta, scaleLuta: 18 },
  quindim: { w: 26, h: 28, jump: -12.8, frente: SPR.qFrente, correr: SPR.qCorrer, scaleFrente: 10, scaleCorrer: 4, luta: SPR.qLuta, scaleLuta: 12 },
};

/* Troca a forma do jogador preservando os pés (base do sprite) no lugar */
function setForm(name) {
  if (player.form === name) return;
  const f = FORM[name];
  const oldH = player.h;
  player.form = name;
  player.w = f.w;
  player.h = f.h;
  player.y += (oldH - f.h);
}

function setLeader(name) {
  if (name !== "betinho" && name !== "quindim") return;
  const oldName = player.leader;
  if (oldName === name) return;
  const oldX = player.x, oldY = player.y + player.h;
  player.leader = name;
  setForm(name);
  companion.form = oldName;
  const cf = FORM[companion.form];
  companion.w = cf.w;
  companion.h = cf.h;
  companion.x = oldX;
  companion.y = oldY - companion.h;
  companion.facing = player.facing;
  Sound.powerup();
  toast(name === "quindim" ? "Quindim lidera" : "Betinho lidera", 90);
}

function touchExchangePoint(point) {
  if (!point || point.cooldown > 0 || point.armed === false) return;
  point.cooldown = 18;
  point.armed = false;
  setLeader(player.leader === "betinho" ? "quindim" : "betinho");
  point.lastLeader = player.leader;
}

/* Checa se dá pra crescer de volta pro tamanho do Betinho sem enfiar a cabeça num sólido */
function canGrowToBetinho(lv) {
  const bf = FORM.betinho;
  const testBox = { x: player.x, y: player.y + (player.h - bf.h), w: bf.w, h: bf.h };
  for (const s of lv.solids.concat(movers)) {
    if (aabb(testBox, s)) return false;
  }
  return true;
}

/* ---------- Utilidades ---------- */
function aabb(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}
function rect(x, y, w, h) { return { x, y, w, h }; }
function coin(x, y) { return { x, y }; }

/* ============================================================
   FASES
   Espaço de mundo: chão no topo y=500. Vãos = buracos (queda mata).
   solids  : retângulos sólidos (chão + plataformas)
   enemies : {type:'patrol'|'chase', x, surfaceY, minX, maxX}
             {type:'flyer', x, y, minX, maxX, bobAmp}  -- voa, ignora chão
             {type:'miniboss', x, minX, maxX}          -- aguenta MINIBOSS_HP pisões
   stars/boosts/feathers: efeitos temporários (estrela, velocidade, planar)
   ============================================================ */
const GROUND_Y = 500;

function makeLevel(cfg) { return cfg; }

const LEVELS = [
  // ---------------- FASE 1 (tranquila) ----------------
  makeLevel({
    worldW: 2600,
    sky: ["#7ec8ff", "#bfe8ff"],
    hill: "#61c25a",
    start: { x: 60, y: GROUND_Y - PH },
    goalX: 2500,
    checkpoints: [1300, 2100],
    solids: [
      rect(0,   GROUND_Y, 900, 40),
      rect(980, GROUND_Y, 720, 40),
      rect(1780,GROUND_Y, 820, 40),
      rect(360, 400, 120, 24),
      rect(620, 330, 120, 24),
      rect(1180,400, 140, 24),
      rect(1460,340, 120, 24),
      rect(2060,400, 140, 24),
    ],
    enemies: [
      { type: "patrol", x: 500,  surfaceY: GROUND_Y, minX: 380, maxX: 780 },
      { type: "patrol", x: 1300, surfaceY: GROUND_Y, minX: 1020, maxX: 1650 },
      { type: "chase",  x: 2150, surfaceY: GROUND_Y, minX: 1800, maxX: 2560 },
      { type: "flyer",  x: 850,  y: 230, minX: 800, maxX: 1000, bobAmp: 20 },
      { type: "miniboss", x: 2300, minX: 2260, maxX: 2480 },
    ],
    coins: [
      coin(390, 350), coin(420, 320), coin(450, 350),
      coin(650, 280), coin(680, 260), coin(710, 280),
      coin(1210, 350), coin(1240, 320), coin(1270, 350),
      coin(1490, 290), coin(1520, 260), coin(1550, 290),
      coin(2090, 350), coin(2120, 320), coin(2150, 350),
    ],
    quindins: [ coin(665, 255), coin(1505, 260) ],
    stars: [ coin(930, 270) ],
    boosts: [ coin(1950, 260) ],
    feathers: [ coin(2250, 300) ],
  }),

  // ---------------- FASE 2 (média) ----------------
  makeLevel({
    worldW: 2900,
    sky: ["#ffb26b", "#ffd9a0"],
    hill: "#4fae7a",
    start: { x: 60, y: GROUND_Y - PH },
    goalX: 2800,
    checkpoints: [1000, 2100],
    solids: [
      rect(0,    GROUND_Y, 620, 40),
      rect(760,  GROUND_Y, 460, 40),
      rect(1360, GROUND_Y, 380, 40),
      rect(1900, GROUND_Y, 1000,40),
      rect(300,  380, 120, 24),
      rect(560,  300, 110, 24),
      rect(880,  360, 120, 24),
      rect(1180, 300, 120, 24),
      rect(1500, 380, 120, 24),
      rect(1740, 290, 120, 24),
      rect(2200, 360, 130, 24),
      rect(2480, 300, 130, 24),
    ],
    enemies: [
      { type: "patrol", x: 400,  surfaceY: GROUND_Y, minX: 180, maxX: 560 },
      { type: "chase",  x: 1050, surfaceY: GROUND_Y, minX: 780, maxX: 1200 },
      { type: "patrol", x: 2050, surfaceY: GROUND_Y, minX: 1920, maxX: 2380 },
      { type: "chase",  x: 2600, surfaceY: GROUND_Y, minX: 2400, maxX: 2860 },
      { type: "flyer",  x: 1020, y: 200, minX: 1000, maxX: 1150, bobAmp: 22 },
      { type: "miniboss", x: 2650, minX: 2600, maxX: 2820 },
    ],
    coins: [
      coin(340, 310), coin(370, 280), coin(400, 310),
      coin(660, 320), coin(700, 290), coin(740, 320),
      coin(900, 300), coin(930, 270), coin(960, 300),
      coin(1210, 300), coin(1250, 270), coin(1290, 300),
      coin(1520, 320), coin(1550, 290), coin(1580, 320),
      coin(1760, 250), coin(1790, 220), coin(1820, 250),
      coin(2220, 300), coin(2260, 270), coin(2300, 300),
      coin(2500, 240), coin(2530, 210), coin(2560, 240),
    ],
    quindins: [ coin(1785, 215), coin(2530, 225) ],
    stars: [ coin(1050, 240) ],
    boosts: [ coin(1650, 260) ],
    feathers: [ coin(2000, 240) ],
  }),

  // ---------------- FASE 3 (difícil) ----------------
  makeLevel({
    worldW: 3200,
    sky: ["#3a2b6b", "#6b52c9"],
    hill: "#3d7d55",
    start: { x: 60, y: GROUND_Y - PH },
    goalX: 3100,
    checkpoints: [1200, 2560],
    solids: [
      rect(0,    GROUND_Y, 460, 40),
      rect(620,  GROUND_Y, 300, 40),
      rect(1080, GROUND_Y, 260, 40),
      rect(1520, GROUND_Y, 240, 40),
      rect(1980, GROUND_Y, 260, 40),
      rect(2460, GROUND_Y, 740, 40),
      rect(300,  360, 110, 24),
      rect(520,  280, 100, 24),
      rect(760,  340, 110, 24),
      rect(1000, 270, 100, 24),
      rect(1260, 350, 100, 24),
      rect(1460, 260, 100, 24),
      rect(1720, 330, 100, 24),
      rect(1980, 250, 100, 24),
      rect(2240, 330, 110, 24),
      rect(2600, 300, 120, 24),
      rect(2860, 240, 120, 24),
    ],
    enemies: [
      { type: "patrol", x: 300,  surfaceY: GROUND_Y, minX: 120, maxX: 420 },
      { type: "chase",  x: 800,  surfaceY: GROUND_Y, minX: 640, maxX: 900 },
      { type: "chase",  x: 1600, surfaceY: GROUND_Y, minX: 1540, maxX: 1740 },
      { type: "patrol", x: 2600, surfaceY: GROUND_Y, minX: 2480, maxX: 3160 },
      { type: "chase",  x: 2900, surfaceY: GROUND_Y, minX: 2480, maxX: 3160 },
      { type: "flyer",  x: 1300, y: 180, minX: 1280, maxX: 1450, bobAmp: 24 },
      { type: "miniboss", x: 2950, minX: 2900, maxX: 3160 },
    ],
    coins: [
      coin(540, 210), coin(570, 190), coin(600, 210),
      coin(1020, 200), coin(1050, 180), coin(1080, 200),
      coin(1480, 190), coin(1510, 170), coin(1540, 190),
      coin(2000, 180), coin(2030, 160), coin(2060, 180),
      coin(2620, 230), coin(2650, 210), coin(2680, 230),
      coin(2880, 170), coin(2910, 150), coin(2940, 170),
    ],
    quindins: [ coin(1495, 185), coin(2905, 165) ],
    stars: [ coin(1300, 220) ],
    boosts: [ coin(1780, 220) ],
    feathers: [ coin(2300, 200) ],
  }),

  // ---------------- FASE 4 (difícil+, exige pulo duplo) ----------------
  makeLevel({
    worldW: 3400,
    sky: ["#243b6b", "#c86b8a"],
    hill: "#5a4a8a",
    start: { x: 60, y: GROUND_Y - PH },
    goalX: 3300,
    checkpoints: [1000, 2500], // 1000 fica sobre o chão 700-1100 (1200 caía no vão 1100-1300)
    solids: [
      rect(0,    GROUND_Y, 500, 40),   // 0-500
      rect(700,  GROUND_Y, 400, 40),   // 700-1100 (gap 500-700)
      rect(1300, GROUND_Y, 350, 40),   // 1300-1650 (gap 1100-1300)
      rect(1850, GROUND_Y, 400, 40),   // 1850-2250 (gap 1650-1850)
      rect(2470, GROUND_Y, 930, 40),   // 2470-3400 (gap 2250-2470)
      rect(780,  380, 110, 24),
      rect(950,  330, 100, 24),
      rect(1450, 350, 110, 24),
      rect(1550, 290, 100, 24),
      rect(1950, 370, 110, 24),
      rect(2080, 310, 100, 24),
      rect(2600, 350, 110, 24),
      rect(2750, 280, 100, 24),
      rect(2900, 230, 100, 24),
    ],
    enemies: [
      { type: "patrol", x: 800,  surfaceY: GROUND_Y, minX: 700, maxX: 1100 },
      { type: "chase",  x: 950,  surfaceY: 330,       minX: 900, maxX: 1050 },
      { type: "patrol", x: 1400, surfaceY: GROUND_Y, minX: 1300, maxX: 1650 },
      { type: "chase",  x: 2000, surfaceY: GROUND_Y, minX: 1850, maxX: 2250 },
      { type: "patrol", x: 2700, surfaceY: GROUND_Y, minX: 2470, maxX: 3300 },
      { type: "flyer",  x: 1080, y: 250, minX: 1080, maxX: 1280, bobAmp: 26 },
      { type: "miniboss", x: 3150, minX: 3100, maxX: 3300 },
    ],
    coins: [
      coin(560, 330), coin(600, 300), coin(640, 330),   // arco sobre o vão 500-700
      coin(800, 340), coin(970, 290),
      coin(1160, 340), coin(1200, 310), coin(1240, 340), // arco sobre o vão 1100-1300
      coin(1470, 310), coin(1570, 250),
      coin(1710, 320), coin(1750, 290), coin(1790, 320), // arco sobre o vão 1650-1850
      coin(1970, 330), coin(2100, 270),
      coin(2320, 310), coin(2360, 280), coin(2400, 310), // arco sobre o vão 2250-2470
      coin(2620, 310), coin(2770, 240), coin(2920, 190),
    ],
    quindins: [ coin(1585, 215), coin(2935, 155) ],
    stars: [ coin(1180, 260) ],
    boosts: [ coin(1700, 280) ],
    feathers: [ coin(2350, 260) ],
  }),

  // ---------------- FASE 5 (final, plataformas móveis) ----------------
  makeLevel({
    worldW: 3800,
    sky: ["#0e0b2a", "#3a1c5e"],
    hill: "#241a4a",
    start: { x: 60, y: GROUND_Y - PH },
    goalX: 3700,
    // 950 fica sobre o chão 720-1120 (1300 caía no vão 1120-1350)
    // 2850 fica sobre o chão 2760-3800 (2700 caía no vão 2520-2760)
    checkpoints: [950, 2850],
    solids: [
      rect(0,    GROUND_Y, 500, 40),    // 0-500
      rect(720,  GROUND_Y, 400, 40),    // 720-1120 (gap 500-720)
      rect(1350, GROUND_Y, 450, 40),    // 1350-1800 (gap 1120-1350)
      rect(2020, GROUND_Y, 500, 40),    // 2020-2520 (gap 1800-2020)
      rect(2760, GROUND_Y, 1040,40),    // 2760-3800 (gap 2520-2760)
    ],
    movers: [
      { x: 500,  y: 460, w: 120, h: 20, axis: "x", range: 100, speed: 1.4 },
      { x: 1120, y: 460, w: 130, h: 20, axis: "x", range: 100, speed: 1.6 },
      { x: 1800, y: 460, w: 120, h: 20, axis: "x", range: 100, speed: 1.8 },
      { x: 2520, y: 460, w: 130, h: 20, axis: "x", range: 110, speed: 2.0 },
      { x: 3200, y: 240, w: 110, h: 20, axis: "y", range: 220, speed: 1.2 },
    ],
    enemies: [
      { type: "chase",  x: 800,  surfaceY: GROUND_Y, minX: 720,  maxX: 1120 },
      { type: "patrol", x: 1450, surfaceY: GROUND_Y, minX: 1350, maxX: 1800 },
      { type: "chase",  x: 1650, surfaceY: GROUND_Y, minX: 1350, maxX: 1800 },
      { type: "patrol", x: 2100, surfaceY: GROUND_Y, minX: 2020, maxX: 2520 },
      { type: "chase",  x: 2400, surfaceY: GROUND_Y, minX: 2020, maxX: 2520 },
      { type: "patrol", x: 2900, surfaceY: GROUND_Y, minX: 2760, maxX: 3800 },
      { type: "flyer",  x: 1700, y: 200, minX: 1700, maxX: 1850, bobAmp: 24 },
      { type: "miniboss", x: 3550, minX: 3500, maxX: 3750 },
    ],
    coins: [
      coin(560, 400), coin(600, 380), coin(640, 400),
      coin(1170, 400), coin(1210, 380), coin(1250, 400),
      coin(1850, 400), coin(1890, 380), coin(1930, 400),
      coin(2570, 400), coin(2610, 380), coin(2650, 400),
      coin(3220, 300), coin(3250, 270), coin(3280, 300),
      coin(3600, 400), coin(3630, 370), coin(3660, 400),
    ],
    quindins: [ coin(930, 430), coin(2830, 430) ],
    stars: [ coin(1400, 350) ],
    boosts: [ coin(2200, 350) ],
    feathers: [ coin(3000, 300) ],
  }),

  // ---------------- FASE 6 ("Os Túneis", desenhada à mão) ----------------
  makeLevel({
    worldW: 4050,
    sky: ["#0b3a3a", "#177a6a"],
    hill: "#0f5c4e",
    start: { x: 60, y: GROUND_Y - PH },
    goalX: 3400,
    checkpoints: [300, 790, 1550],
    solids: [
      // --- Trecho 1: tutorial (0-700) ---
      rect(0, GROUND_Y, 760, 40),
      rect(700, 300, 60, 200),           // muro intransponível: só o túnel leva adiante

      // --- Trecho 2: rota dupla (760-1500) ---
      rect(760, GROUND_Y, 740, 40),
      rect(860, 200, 340, 260),          // teto baixo: só o Quindim passa por baixo (40px de vão)

      // --- Trecho 3: escolha de canos (1500-2300) ---
      rect(1500, GROUND_Y, 800, 40),

      // --- Trecho 4: corrida final (2300-3400) ---
      rect(2320, 320, 150, 24),          // plataforma de chegada do 3º cano
      rect(2560, 380, 120, 24),
      rect(2760, 300, 130, 24),
      rect(2950, GROUND_Y, 550, 40),     // reta final até a bandeira

      // --- Bolsões (só acessíveis pelos canos de escolha) ---
      rect(3600, GROUND_Y, 160, 40), rect(3590, 300, 10, 200), rect(3760, 300, 10, 200),
      rect(3800, GROUND_Y, 160, 40), rect(3790, 300, 10, 200), rect(3960, 300, 10, 200),
    ],
    tunnels: [
      { id: "t6a", x: 640, y: GROUND_Y, exit: "t6b", dir: "down" },
      { id: "t6b", x: 800, y: GROUND_Y, exit: null },
      { id: "t6c1", x: 1650, y: GROUND_Y, exit: "t6pocketA_in", dir: "down" },
      { id: "t6c2", x: 1750, y: GROUND_Y, exit: "t6pocketB_in", dir: "down" },
      { id: "t6c3", x: 1850, y: GROUND_Y, exit: "t6sec4dest", dir: "down" },
      { id: "t6sec4dest", x: 2350, y: 320, exit: null },
      { id: "t6pocketA_in", x: 3640, y: GROUND_Y, exit: null },
      { id: "t6pocketA_ret", x: 3700, y: GROUND_Y, exit: "t6chooseback", dir: "down" },
      { id: "t6pocketB_in", x: 3840, y: GROUND_Y, exit: null },
      { id: "t6pocketB_ret", x: 3900, y: GROUND_Y, exit: "t6chooseback", dir: "down" },
      { id: "t6chooseback", x: 2100, y: GROUND_Y, exit: null },
    ],
    enemies: [
      { type: "chase",  x: 830,  surfaceY: GROUND_Y, minX: 800,  maxX: 1050 },
      { type: "patrol", x: 1300, surfaceY: GROUND_Y, minX: 1210, maxX: 1480 },
      { type: "chase",  x: 2400, surfaceY: 320,       minX: 2320, maxX: 2470 },
      { type: "patrol", x: 2650, surfaceY: 380,       minX: 2560, maxX: 2680 },
      { type: "patrol", x: 3050, surfaceY: GROUND_Y, minX: 2950, maxX: 3400 },
      { type: "flyer",  x: 2500, y: 250, minX: 2500, maxX: 2700, bobAmp: 22 },
      { type: "miniboss", x: 3200, minX: 3150, maxX: 3390 },
    ],
    coins: [
      coin(1250, 450), coin(1280, 430), coin(1310, 450),
      coin(3620, 450), coin(3650, 430), coin(3680, 450),
      coin(3820, 450), coin(3850, 430), coin(3880, 450),
    ],
    quindins: [
      coin(350, 430),  // no meio do tutorial
      coin(825, 430),  // antes da passagem baixa (pra quem reverteu pro Betinho)
      coin(1600, 430), // na área de escolha dos canos
    ],
    stars: [ coin(500, 300) ],
    boosts: [ coin(3000, 250) ],
    feathers: [ coin(1950, 420) ],
  }),

  // Fase 7: travessia do aqueduto, combinando pulo duplo, dash e mergulho.
  makeLevel({
    worldW: 3200, sky: ["#68446d", "#ffc794"], hill: "#526c76",
    start: { x: 60, y: GROUND_Y - PH }, goalX: 3070,
    checkpoints: [1000, 2170],
    solids: [rect(0,500,560,40), rect(760,500,500,40), rect(1470,500,470,40),
      rect(2140,500,1060,40), rect(320,400,140,24), rect(850,370,150,24),
      rect(1090,280,150,24), rect(1580,380,140,24), rect(1790,295,120,24),
      rect(2380,390,150,24), rect(2630,310,130,24)],
    movers: [{x:600,y:410,w:100,h:20,axis:"y",range:60,speed:1.2}],
    enemies: [{type:"patrol",x:1050,surfaceY:500,minX:1020,maxX:1210},
      {type:"miniboss",x:2270,minX:2180,maxX:2360},
      {type:"patrol",x:2780,surfaceY:500,minX:2750,maxX:2990}],
    coins: [coin(350,350),coin(400,325),coin(620,340),coin(870,320),
      coin(1120,230),coin(1190,230),coin(1330,260),coin(1610,330),
      coin(1820,245),coin(2010,280),coin(2420,340),coin(2670,260),coin(2890,420)],
    quindins: [coin(900,325)], feathers: [coin(1820,245)],
  }),

  // ---------------- FASE 8 (fim do entardecer: todos os inimigos juntos) ----------------
  makeLevel({
    worldW: 3600,
    sky: ["#402b1f", "#e08b3a"],
    hill: "#8a4a2a",
    start: { x: 60, y: GROUND_Y - PH },
    goalX: 3500,
    checkpoints: [1220, 2360],
    solids: [
      rect(0,    GROUND_Y, 500, 40),   // 0-500
      rect(680,  GROUND_Y, 380, 40),   // 680-1060 (gap 500-680)
      rect(1220, GROUND_Y, 400, 40),   // 1220-1620 (gap 1060-1220)
      rect(1780, GROUND_Y, 420, 40),   // 1780-2200 (gap 1620-1780)
      rect(2360, GROUND_Y, 440, 40),   // 2360-2800 (gap 2200-2360)
      rect(2960, GROUND_Y, 640, 40),   // 2960-3600 (gap 2800-2960)
      rect(760,  380, 110, 24),
      rect(920,  320, 100, 24),
      rect(1300, 360, 110, 24),
      rect(1460, 300, 100, 24),
      rect(1860, 380, 110, 24),
      rect(2020, 320, 100, 24),
      rect(2440, 360, 110, 24),
      rect(2600, 300, 100, 24),
      rect(3040, 340, 110, 24),
      rect(3200, 280, 100, 24),
    ],
    enemies: [
      // combo 1: patrol + flyer logo de cara
      { type: "patrol", x: 300,  surfaceY: GROUND_Y, minX: 120,  maxX: 460 },
      { type: "flyer",  x: 380,  y: 250, minX: 300,  maxX: 480,  bobAmp: 22 },
      // combo 2: patrol + chase no mesmo trecho
      { type: "patrol", x: 780,  surfaceY: GROUND_Y, minX: 680,  maxX: 1060 },
      { type: "chase",  x: 950,  surfaceY: GROUND_Y, minX: 680,  maxX: 1060 },
      // combo 3: flyer + chase sobre o vão
      { type: "chase",  x: 1500, surfaceY: GROUND_Y, minX: 1220, maxX: 1620 },
      { type: "flyer",  x: 1350, y: 220, minX: 1250, maxX: 1550, bobAmp: 26 },
      // combo 4: os três juntos (patrol + chase + flyer)
      { type: "patrol", x: 1850, surfaceY: GROUND_Y, minX: 1780, maxX: 2200 },
      { type: "chase",  x: 2050, surfaceY: GROUND_Y, minX: 1780, maxX: 2200 },
      { type: "flyer",  x: 1950, y: 240, minX: 1850, maxX: 2150, bobAmp: 24 },
      // combo 5: mesma mistura, ramp final
      { type: "patrol", x: 2450, surfaceY: GROUND_Y, minX: 2360, maxX: 2800 },
      { type: "chase",  x: 2650, surfaceY: GROUND_Y, minX: 2360, maxX: 2800 },
      { type: "flyer",  x: 2550, y: 230, minX: 2450, maxX: 2750, bobAmp: 24 },
      // finale: miniboss protegido por patrol + chase + flyer
      { type: "patrol", x: 3050, surfaceY: GROUND_Y, minX: 2960, maxX: 3550 },
      { type: "chase",  x: 3250, surfaceY: GROUND_Y, minX: 2960, maxX: 3550 },
      { type: "flyer",  x: 3150, y: 220, minX: 3050, maxX: 3450, bobAmp: 24 },
      { type: "miniboss", x: 3450, minX: 3400, maxX: 3580 },
    ],
    coins: [
      coin(790, 340),  coin(820, 310),  coin(850, 340),
      coin(950, 290),  coin(980, 260),  coin(1010, 290),
      coin(1330, 330), coin(1360, 300), coin(1390, 330),
      coin(1490, 270), coin(1520, 240), coin(1550, 270),
      coin(1890, 350), coin(1920, 320), coin(1950, 350),
      coin(2050, 290), coin(2080, 260), coin(2110, 290),
      coin(2470, 330), coin(2500, 300), coin(2530, 330),
      coin(2630, 270), coin(2660, 240), coin(2690, 270),
      coin(3070, 310), coin(3100, 280), coin(3130, 310),
      coin(3230, 250), coin(3260, 220), coin(3290, 250),
    ],
    quindins: [ coin(940, 265), coin(2075, 265) ],
    stars: [ coin(1400, 280) ],
    boosts: [ coin(2500, 260) ],
    feathers: [ coin(3100, 260) ],
  }),

  /* ============================================================
     MUNDO 2 — floresta escura, à noite (fases 9-16)
     ============================================================ */

  // ---------------- FASE 9 (entrada no mundo 2, penumbra) ----------------
  makeLevel({
    worldW: 2800,
    sky: ["#16233a", "#2c3d52"],
    hill: "#1c3326",
    start: { x: 60, y: GROUND_Y - PH },
    goalX: 2700,
    checkpoints: [1300, 2200],
    solids: [
      rect(0,    GROUND_Y, 900, 40),
      rect(980,  GROUND_Y, 720, 40),
      rect(1780, GROUND_Y, 1020,40),
      rect(360,  400, 120, 24),
      rect(620,  330, 120, 24),
      rect(1180, 400, 140, 24),
      rect(1460, 340, 120, 24),
      rect(2060, 400, 140, 24),
      rect(2350, 340, 120, 24),
    ],
    enemies: [
      { type: "patrol", x: 500,  surfaceY: GROUND_Y, minX: 380,  maxX: 780 },
      { type: "patrol", x: 1300, surfaceY: GROUND_Y, minX: 1020, maxX: 1650 },
      { type: "chase",  x: 2150, surfaceY: GROUND_Y, minX: 1800, maxX: 2700 },
      { type: "patrol", x: 2450, surfaceY: GROUND_Y, minX: 2360, maxX: 2650 },
      { type: "flyer",  x: 850,  y: 230, minX: 800, maxX: 1000, bobAmp: 20 },
      { type: "miniboss", x: 2600, minX: 2560, maxX: 2780 },
    ],
    coins: [
      coin(390, 350), coin(420, 320), coin(450, 350),
      coin(650, 280), coin(680, 260), coin(710, 280),
      coin(1210, 350), coin(1240, 320), coin(1270, 350),
      coin(1490, 290), coin(1520, 260), coin(1550, 290),
      coin(2090, 350), coin(2120, 320), coin(2150, 350),
      coin(2380, 310), coin(2410, 280), coin(2440, 310),
    ],
    quindins: [ coin(665, 255), coin(1505, 260), coin(2400, 285) ],
    stars: [ coin(930, 270) ],
    boosts: [ coin(1950, 260) ],
    feathers: [ coin(2650, 300) ],
  }),

  // ---------------- FASE 10 (mata mais funda) ----------------
  makeLevel({
    worldW: 3200,
    sky: ["#0f1a2c", "#22303f"],
    hill: "#132a1e",
    start: { x: 60, y: GROUND_Y - PH },
    goalX: 3100,
    checkpoints: [1100, 2300],
    solids: [
      rect(0,    GROUND_Y, 620, 40),
      rect(760,  GROUND_Y, 460, 40),
      rect(1360, GROUND_Y, 380, 40),
      rect(1900, GROUND_Y, 1200,40),
      rect(300,  380, 120, 24),
      rect(560,  300, 110, 24),
      rect(880,  360, 120, 24),
      rect(1180, 300, 120, 24),
      rect(1500, 380, 120, 24),
      rect(1740, 290, 120, 24),
      rect(2200, 360, 130, 24),
      rect(2480, 300, 130, 24),
      rect(2820, 340, 120, 24),
    ],
    enemies: [
      { type: "patrol", x: 400,  surfaceY: GROUND_Y, minX: 180,  maxX: 560 },
      { type: "chase",  x: 1050, surfaceY: GROUND_Y, minX: 780,  maxX: 1200 },
      { type: "patrol", x: 2050, surfaceY: GROUND_Y, minX: 1920, maxX: 2380 },
      { type: "chase",  x: 2600, surfaceY: GROUND_Y, minX: 2400, maxX: 3080 },
      { type: "patrol", x: 2900, surfaceY: GROUND_Y, minX: 2400, maxX: 3080 },
      { type: "flyer",  x: 1020, y: 200, minX: 1000, maxX: 1150, bobAmp: 22 },
      { type: "miniboss", x: 2950, minX: 2900, maxX: 3080 },
    ],
    coins: [
      coin(340, 310), coin(370, 280), coin(400, 310),
      coin(660, 320), coin(700, 290), coin(740, 320),
      coin(900, 300), coin(930, 270), coin(960, 300),
      coin(1210, 300), coin(1250, 270), coin(1290, 300),
      coin(1520, 320), coin(1550, 290), coin(1580, 320),
      coin(1760, 250), coin(1790, 220), coin(1820, 250),
      coin(2220, 300), coin(2260, 270), coin(2300, 300),
      coin(2500, 240), coin(2530, 210), coin(2560, 240),
      coin(2840, 300), coin(2870, 270), coin(2900, 300),
    ],
    quindins: [ coin(1785, 215), coin(2530, 225) ],
    stars: [ coin(1050, 240) ],
    boosts: [ coin(1650, 260) ],
    feathers: [ coin(2760, 240) ],
  }),

  // ---------------- FASE 11 (difícil, plataformas móveis) ----------------
  makeLevel({
    worldW: 3500,
    sky: ["#0c1524", "#1c2c3a"],
    hill: "#0f2318",
    start: { x: 60, y: GROUND_Y - PH },
    goalX: 3400,
    checkpoints: [1000, 2500],
    solids: [
      rect(0,    GROUND_Y, 500, 40),
      rect(700,  GROUND_Y, 400, 40),
      rect(1300, GROUND_Y, 350, 40),
      rect(1850, GROUND_Y, 400, 40),
      rect(2470, GROUND_Y, 1030,40),
    ],
    movers: [
      { x: 500,  y: 400, w: 120, h: 20, axis: "x", range: 100, speed: 1.6 },
      { x: 1650, y: 380, w: 130, h: 20, axis: "x", range: 110, speed: 1.9 },
      { x: 2250, y: 320, w: 110, h: 20, axis: "y", range: 200, speed: 1.4 },
    ],
    enemies: [
      { type: "patrol", x: 800,  surfaceY: GROUND_Y, minX: 700, maxX: 1100 },
      { type: "chase",  x: 950,  surfaceY: GROUND_Y, minX: 700, maxX: 1100 },
      { type: "patrol", x: 1400, surfaceY: GROUND_Y, minX: 1300, maxX: 1650 },
      { type: "chase",  x: 2000, surfaceY: GROUND_Y, minX: 1850, maxX: 2250 },
      { type: "patrol", x: 2700, surfaceY: GROUND_Y, minX: 2470, maxX: 3400 },
      { type: "chase",  x: 3000, surfaceY: GROUND_Y, minX: 2470, maxX: 3400 },
      { type: "flyer",  x: 1080, y: 250, minX: 1080, maxX: 1280, bobAmp: 26 },
      { type: "miniboss", x: 3250, minX: 3200, maxX: 3400 },
    ],
    coins: [
      coin(560, 370), coin(600, 340), coin(640, 370),
      coin(1680, 350), coin(1720, 320), coin(1760, 350),
      coin(2280, 290), coin(2320, 260), coin(2360, 290),
      coin(2620, 310), coin(2770, 240), coin(2920, 190),
      coin(3070, 300), coin(3200, 250),
    ],
    quindins: [ coin(1585, 215), coin(2935, 155) ],
    stars: [ coin(1180, 260) ],
    boosts: [ coin(1700, 280) ],
    feathers: [ coin(2350, 260) ],
  }),

  // ---------------- FASE 12 ("O Bosque Fechado", atalho por túnel) ----------------
  makeLevel({
    worldW: 3600,
    sky: ["#0a1220", "#182534"],
    hill: "#0c1f14",
    start: { x: 60, y: GROUND_Y - PH },
    goalX: 3500,
    checkpoints: [900, 2200],
    solids: [
      // --- caminho principal (mais longo, no chão) ---
      rect(0,    GROUND_Y, 640, 40),
      rect(640,  300, 60, 240),           // muro: só o túnel passa
      rect(760,  GROUND_Y, 900, 40),
      rect(1780, GROUND_Y, 900, 40),
      rect(2800, GROUND_Y, 700, 40),
      rect(400,  380, 120, 24),
      rect(950,  360, 120, 24),
      rect(1300, 300, 120, 24),
      rect(2000, 380, 120, 24),
      rect(2350, 320, 120, 24),
      rect(2980, 360, 120, 24),
      rect(3200, 300, 120, 24),
    ],
    tunnels: [
      { id: "t12a", x: 590, y: GROUND_Y, exit: "t12b", dir: "down" },
      { id: "t12b", x: 800, y: GROUND_Y, exit: null },
    ],
    enemies: [
      { type: "patrol", x: 900,  surfaceY: GROUND_Y, minX: 760,  maxX: 1350 },
      { type: "chase",  x: 1550, surfaceY: GROUND_Y, minX: 1400, maxX: 1650 },
      { type: "patrol", x: 2000, surfaceY: GROUND_Y, minX: 1780, maxX: 2680 },
      { type: "chase",  x: 2450, surfaceY: GROUND_Y, minX: 1780, maxX: 2680 },
      { type: "flyer",  x: 2200, y: 240, minX: 2100, maxX: 2350, bobAmp: 22 },
      { type: "patrol", x: 3000, surfaceY: GROUND_Y, minX: 2800, maxX: 3500 },
      { type: "miniboss", x: 3350, minX: 3300, maxX: 3500 },
    ],
    coins: [
      coin(430, 350), coin(460, 320), coin(490, 350),
      coin(980, 330), coin(1330, 270),
      coin(2030, 350), coin(2380, 290),
      coin(3010, 330), coin(3230, 270),
    ],
    quindins: [ coin(430, 350), coin(2380, 290) ],
    stars: [ coin(1600, 260) ],
    boosts: [ coin(2500, 260) ],
    feathers: [ coin(3100, 260) ],
  }),

  // ---------------- FASE 13 (difícil, plataformas móveis + gaps largos) ----------------
  makeLevel({
    worldW: 3900,
    sky: ["#080f1c", "#131f2c"],
    hill: "#0a1b12",
    start: { x: 60, y: GROUND_Y - PH },
    goalX: 3800,
    checkpoints: [950, 2900],
    solids: [
      rect(0,    GROUND_Y, 500, 40),    // 0-500
      rect(720,  GROUND_Y, 400, 40),    // 720-1120 (gap 500-720)
      rect(1350, GROUND_Y, 450, 40),    // 1350-1800 (gap 1120-1350)
      rect(2020, GROUND_Y, 500, 40),    // 2020-2520 (gap 1800-2020)
      rect(2760, GROUND_Y, 1140,40),    // 2760-3900 (gap 2520-2760)
    ],
    movers: [
      { x: 500,  y: 460, w: 120, h: 20, axis: "x", range: 100, speed: 1.7 },
      { x: 1120, y: 460, w: 130, h: 20, axis: "x", range: 100, speed: 1.9 },
      { x: 1800, y: 460, w: 120, h: 20, axis: "x", range: 100, speed: 2.1 },
      { x: 2520, y: 460, w: 130, h: 20, axis: "x", range: 110, speed: 2.3 },
      { x: 3200, y: 240, w: 110, h: 20, axis: "y", range: 220, speed: 1.5 },
    ],
    enemies: [
      { type: "chase",  x: 800,  surfaceY: GROUND_Y, minX: 720,  maxX: 1120 },
      { type: "patrol", x: 1450, surfaceY: GROUND_Y, minX: 1350, maxX: 1800 },
      { type: "chase",  x: 1650, surfaceY: GROUND_Y, minX: 1350, maxX: 1800 },
      { type: "patrol", x: 2100, surfaceY: GROUND_Y, minX: 2020, maxX: 2520 },
      { type: "chase",  x: 2400, surfaceY: GROUND_Y, minX: 2020, maxX: 2520 },
      { type: "patrol", x: 2900, surfaceY: GROUND_Y, minX: 2760, maxX: 3900 },
      { type: "chase",  x: 3400, surfaceY: GROUND_Y, minX: 2760, maxX: 3900 },
      { type: "flyer",  x: 1700, y: 200, minX: 1700, maxX: 1850, bobAmp: 24 },
      { type: "miniboss", x: 3700, minX: 3650, maxX: 3880 },
    ],
    coins: [
      coin(560, 400), coin(600, 380), coin(640, 400),
      coin(1170, 400), coin(1210, 380), coin(1250, 400),
      coin(1850, 400), coin(1890, 380), coin(1930, 400),
      coin(2570, 400), coin(2610, 380), coin(2650, 400),
      coin(3220, 300), coin(3250, 270), coin(3280, 300),
      coin(3600, 400), coin(3630, 370), coin(3660, 400),
    ],
    quindins: [ coin(930, 430), coin(2830, 430) ],
    stars: [ coin(1400, 350) ],
    boosts: [ coin(2200, 350) ],
    feathers: [ coin(3500, 300) ],
  }),

  // ---------------- FASE 14 (corredor final antes da luta) ----------------
  makeLevel({
    worldW: 4100,
    sky: ["#05090f", "#0c1520"],
    hill: "#07140d",
    start: { x: 60, y: GROUND_Y - PH },
    goalX: 4000,
    checkpoints: [1300, 2700],
    solids: [
      rect(0,    GROUND_Y, 460, 40),
      rect(620,  GROUND_Y, 300, 40),
      rect(1080, GROUND_Y, 260, 40),
      rect(1520, GROUND_Y, 240, 40),
      rect(1980, GROUND_Y, 260, 40),
      rect(2460, GROUND_Y, 260, 40),
      rect(2940, GROUND_Y, 1160,40),
      rect(300,  360, 110, 24),
      rect(520,  280, 100, 24),
      rect(760,  340, 110, 24),
      rect(1000, 270, 100, 24),
      rect(1260, 350, 100, 24),
      rect(1460, 260, 100, 24),
      rect(1720, 330, 100, 24),
      rect(1980, 250, 100, 24),
      rect(2240, 330, 110, 24),
      rect(2600, 300, 120, 24),
      rect(2860, 240, 120, 24),
      rect(3200, 320, 120, 24),
      rect(3500, 260, 120, 24),
    ],
    enemies: [
      { type: "patrol", x: 300,  surfaceY: GROUND_Y, minX: 120, maxX: 420 },
      { type: "chase",  x: 800,  surfaceY: GROUND_Y, minX: 640, maxX: 900 },
      { type: "chase",  x: 1600, surfaceY: GROUND_Y, minX: 1540, maxX: 1740 },
      { type: "patrol", x: 2100, surfaceY: GROUND_Y, minX: 1980, maxX: 2240 },
      { type: "patrol", x: 3050, surfaceY: GROUND_Y, minX: 2940, maxX: 4000 },
      { type: "chase",  x: 3500, surfaceY: GROUND_Y, minX: 2940, maxX: 4000 },
      { type: "flyer",  x: 1300, y: 180, minX: 1280, maxX: 1450, bobAmp: 24 },
      { type: "flyer",  x: 3300, y: 200, minX: 3200, maxX: 3450, bobAmp: 24 },
      { type: "miniboss", x: 3900, minX: 3850, maxX: 4000 },
    ],
    coins: [
      coin(540, 210), coin(570, 190), coin(600, 210),
      coin(1020, 200), coin(1050, 180), coin(1080, 200),
      coin(1480, 190), coin(1510, 170), coin(1540, 190),
      coin(2000, 180), coin(2030, 160), coin(2060, 180),
      coin(2620, 230), coin(2650, 210), coin(2680, 230),
      coin(2880, 170), coin(2910, 150), coin(2940, 170),
      coin(3220, 250), coin(3520, 190),
    ],
    quindins: [ coin(1495, 185), coin(2905, 165) ],
    stars: [ coin(1300, 220) ],
    boosts: [ coin(1780, 220) ],
    feathers: [ coin(3700, 220) ],
  }),

  // ---------------- FASE 15 (última travessia até a vila) ----------------
  makeLevel({
    worldW: 4200,
    sky: ["#020408", "#060d10"],
    hill: "#03120a",
    start: { x: 60, y: GROUND_Y - PH },
    goalX: 4100,
    checkpoints: [1350, 2650, 3600],
    solids: [
      rect(0,    GROUND_Y, 550, 40),   // 0-550
      rect(730,  GROUND_Y, 420, 40),   // 730-1150 (gap 550-730)
      rect(1300, GROUND_Y, 440, 40),   // 1300-1740 (gap 1150-1300)
      rect(1900, GROUND_Y, 460, 40),   // 1900-2360 (gap 1740-1900)
      rect(2520, GROUND_Y, 480, 40),   // 2520-3000 (gap 2360-2520)
      rect(3160, GROUND_Y, 1040,40),   // 3160-4200 (gap 3000-3160)
      rect(800,  380, 110, 24),
      rect(960,  320, 100, 24),
      rect(1370, 360, 110, 24),
      rect(1540, 300, 100, 24),
      rect(1970, 380, 110, 24),
      rect(2140, 320, 100, 24),
      rect(2590, 360, 110, 24),
      rect(2760, 300, 100, 24),
      rect(3230, 340, 110, 24),
      rect(3400, 280, 100, 24),
      rect(3700, 340, 110, 24),
      rect(3870, 280, 100, 24),
    ],
    enemies: [
      // combo 1: patrol + flyer logo de cara
      { type: "patrol", x: 320,  surfaceY: GROUND_Y, minX: 120,  maxX: 500 },
      { type: "flyer",  x: 400,  y: 250, minX: 320,  maxX: 500,  bobAmp: 22 },
      // combo 2: patrol + chase no mesmo trecho
      { type: "patrol", x: 830,  surfaceY: GROUND_Y, minX: 730,  maxX: 1150 },
      { type: "chase",  x: 1000, surfaceY: GROUND_Y, minX: 730,  maxX: 1150 },
      // combo 3: flyer + chase sobre o vão
      { type: "chase",  x: 1550, surfaceY: GROUND_Y, minX: 1300, maxX: 1740 },
      { type: "flyer",  x: 1420, y: 220, minX: 1320, maxX: 1620, bobAmp: 26 },
      // combo 4: os três juntos
      { type: "patrol", x: 1950, surfaceY: GROUND_Y, minX: 1900, maxX: 2360 },
      { type: "chase",  x: 2150, surfaceY: GROUND_Y, minX: 1900, maxX: 2360 },
      { type: "flyer",  x: 2050, y: 240, minX: 1950, maxX: 2300, bobAmp: 24 },
      // combo 5: mesma mistura, mais rápida
      { type: "patrol", x: 2570, surfaceY: GROUND_Y, minX: 2520, maxX: 3000 },
      { type: "chase",  x: 2780, surfaceY: GROUND_Y, minX: 2520, maxX: 3000 },
      { type: "flyer",  x: 2680, y: 230, minX: 2570, maxX: 2950, bobAmp: 24 },
      // combo 6: gauntlet final antes do miniboss
      { type: "patrol", x: 3250, surfaceY: GROUND_Y, minX: 3160, maxX: 3700 },
      { type: "chase",  x: 3450, surfaceY: GROUND_Y, minX: 3160, maxX: 3700 },
      { type: "flyer",  x: 3350, y: 220, minX: 3250, maxX: 3600, bobAmp: 24 },
      // finale: miniboss protegido por patrol + chase + flyer
      { type: "patrol", x: 3750, surfaceY: GROUND_Y, minX: 3700, maxX: 4180 },
      { type: "chase",  x: 3950, surfaceY: GROUND_Y, minX: 3700, maxX: 4180 },
      { type: "flyer",  x: 3850, y: 220, minX: 3750, maxX: 4080, bobAmp: 24 },
      { type: "miniboss", x: 4100, minX: 4050, maxX: 4180 },
    ],
    coins: [
      coin(840, 340),  coin(870, 310),  coin(900, 340),
      coin(1010, 290), coin(1040, 260), coin(1070, 290),
      coin(1400, 330), coin(1430, 300), coin(1460, 330),
      coin(1560, 270), coin(1590, 240), coin(1620, 270),
      coin(1990, 350), coin(2020, 320), coin(2050, 350),
      coin(2160, 290), coin(2190, 260), coin(2220, 290),
      coin(2610, 330), coin(2640, 300), coin(2670, 330),
      coin(2780, 270), coin(2810, 240), coin(2840, 270),
      coin(3250, 310), coin(3280, 280), coin(3310, 310),
      coin(3420, 250), coin(3450, 220), coin(3480, 250),
      coin(3720, 310), coin(3890, 250),
    ],
    quindins: [ coin(990, 265), coin(2135, 265), coin(3440, 265) ],
    stars: [ coin(1450, 280) ],
    boosts: [ coin(2650, 260) ],
    feathers: [ coin(3900, 260) ],
  }),

  // ---------------- FASE 16 (confronto final no portão) ----------------
  makeLevel({
    type: "fight",
    worldW: W,
    sky: ["#0a0f1e", "#241a3a"],
    hill: "#1b1030",
    start: { x: 120, y: GROUND_Y - PH },
    goalX: Infinity,
    checkpoints: [],
    solids: [],
    enemies: [],
    coins: [],
    boss: { name: "LOBO DAS SOMBRAS", color: "#4a2e8a", colorHot: "#9b6bff" },
  }),
];

/*
   O interlúdio tem identidade própria e fica fora de LEVELS de propósito:
   as 16 etapas continuam numeradas e o recorde continua falando de etapas.
*/
const BONUS_ID = "o-rastro-de-quindim";

// Normaliza os mapas antigos: coordenadas continuam iguais, mas o conceito
// público agora é o ponto de troca reutilizável.
for (const lv of LEVELS) {
  if (!lv.exchangePoints) lv.exchangePoints = lv.quindins || [];
}

const BONUS_LEVEL = makeLevel({
  id: BONUS_ID,
  type: "interlude",
  worldW: 2360,
  sky: ["#111c2e", "#26334a"],
  hill: "#152b2c",
  start: { x: 70, y: GROUND_Y - PH },
  goalX: Infinity,
  checkpoints: [640, 1260, 1880],
  solids: [
    rect(0, GROUND_Y, 560, 40),
    rect(700, GROUND_Y, 520, 40),
    rect(1360, GROUND_Y, 520, 40),
    rect(2020, GROUND_Y, 340, 40),
    rect(300, 390, 130, 24),
    rect(860, 350, 140, 24),
    rect(1500, 320, 130, 24),
    rect(2130, 360, 120, 24),
  ],
  enemies: [
    { type: "sentinela", x: 470, surfaceY: GROUND_Y, minX: 430, maxX: 540 },
    { type: "eco", x: 1050, surfaceY: GROUND_Y, minX: 980, maxX: 1160 },
    { type: "espreita", x: 1630, surfaceY: GROUND_Y, minX: 1540, maxX: 1780 },
  ],
  coins: [coin(340, 340), coin(380, 310), coin(920, 300), coin(960, 270), coin(1540, 270), coin(1580, 240), coin(2150, 310)],
  exchangePoints: [coin(180, 430), coin(790, 430), coin(1430, 430), coin(2070, 430)],
});

let bonusActive = false;
let activeChapter = { kind: "stage", id: 1, position: 1 };
let interlude = null;

function currentLevel() {
  return bonusActive ? BONUS_LEVEL : LEVELS[levelIndex];
}

function campaignLabel() {
  return bonusActive ? "Interlúdio" : `Etapa ${levelIndex + 1} de ${LEVELS.length}`;
}

/* Fluxo da campanha — os marcos da história, declarados uma única vez em vez de
   números mágicos espalhados (antes: 7/8/15 espalhados entre updatePlaying,
   updateScene, endRound e startInterlude). Etapas avançam em sequência salvo
   onde o fluxo manda outra coisa: completar a Etapa em interludeAfter entra no
   interlúdio (via cena de separação); a jornada retoma em resumeAt; vencer
   lastStage encerra a viagem. Um modo novo (ex.: corrida) entra aqui como marco
   próprio em vez de virar um if de índice. */
const CAMPAIGN_FLOW = {
  interludeAfter: 7, // índice da Etapa cuja conclusão abre o interlúdio (Etapa 8)
  resumeAt: 8,       // índice em que a jornada retoma após o interlúdio (Etapa 9)
  lastStage: LEVELS.length - 1, // índice da Etapa final (o confronto)
};

/* Sombrias novas aparecem progressivamente na floresta, sem alterar a geometria
   original: do retorno do interlúdio até a véspera do confronto final. */
for (let i = CAMPAIGN_FLOW.resumeAt; i < CAMPAIGN_FLOW.lastStage; i++) {
  const lv = LEVELS[i];
  const floor = (lv.solids || []).find((s) => s.y === GROUND_Y && s.w > 240);
  if (!floor) continue;
  const span = Math.max(180, floor.w - 140);
  lv.enemies.push(
    { type: "sentinela", x: floor.x + Math.min(120, span / 3), surfaceY: GROUND_Y, minX: floor.x + 50, maxX: floor.x + floor.w - 50 },
    { type: "eco", x: floor.x + Math.min(260, span * 0.62), surfaceY: GROUND_Y, minX: floor.x + 90, maxX: floor.x + floor.w - 70 },
    { type: "espreita", x: floor.x + Math.min(390, span * 0.82), surfaceY: GROUND_Y, minX: floor.x + 120, maxX: floor.x + floor.w - 40 },
  );
}

// A última travessia prepara o único confronto; a vitória encerra a viagem.
const JOURNEY = [
  ["A trilha de volta", "O portão ficou aberto e a distância cresceu sem ninguém perceber.", "O segundo pulo alcança caminhos que pareciam longe."],
  ["O mesmo passo", "Betinho e Quindim aprendem a olhar para o mesmo horizonte.", "Solte e aperte pular de novo no ar para ganhar altura."],
  ["Entre pedras e vento", "Cada desvio traz o cheiro de casa um pouco mais perto.", "Use o dash no ar para corrigir a distância."],
  ["Antes do entardecer", "A serra muda de cor. A dupla já não atravessa o caminho sozinha.", "Com a pena, segure pular para escolher onde pousar."],
  ["A última luz quente", "Quando o sol baixa, ficar juntos passa a ser uma escolha.", "Mergulhe com ↓ no ar para criar espaço."],
  ["O túnel estreito", "Há lugares que pedem delicadeza; outros, coragem para abrir passagem.", "O menor dos dois atravessa os túneis com ↓."],
  ["A ponte dourada", "Do outro lado, as primeiras luzes da vila ainda esperam.", "Combine pulo duplo e dash, sem apressar o mergulho."],
  ["A entrada do bosque", "O caminho conhecido termina sob árvores que escondem o céu.", "Guarde o segundo pulo para voltar a uma plataforma."],
  ["Sem deixar pegadas", "A noite chega. Mesmo separados pelo escuro, os dois seguem o mesmo rastro.", "Observe a ameaça antes de cruzar cada raiz."],
  ["Folhas que respondem", "O bosque parece respirar, mas agora o medo também deixa sinais.", "O dash atravessa perigos comuns; espere a abertura das Sombras."],
  ["Sobre as raízes", "O caminho fecha por todos os lados, e a confiança vira direção.", "Pulo duplo sobe; a pena prolonga a descida."],
  ["O rio silencioso", "Além da água, uma janela continua acesa como um convite.", "Salte quando a plataforma móvel chegar."],
  ["A sombra vigia", "O medo cresce quando não se sabe onde ele está. A dupla aprende a esperar.", "O mergulho atinge os guardiões por cima."],
  ["Quase em casa", "O cheiro familiar vence a noite, passo a passo.", "Use os movimentos que já pertencem aos dois."],
  ["As luzes da vila", "O portão apareceu entre as árvores. Só falta atravessar o último trecho.", "Pulo, dash e mergulho resolvem a travessia final."],
  ["O guardião do portão", "O Lobo das Sombras parece enorme porque o caminho ficou escuro.", "Esquive e ataque quando ele errar."],
];
const INTERLUDE_STORY = [
  ["Uma pegada funda", "A terra ainda guarda o peso de Quindim.", "Pista 1 de 3 · encontre a marca no barro."],
  ["Um tufo dourado", "Um fio de pelo ficou preso nas raízes.", "Pista 2 de 3 · o rastro continua, mesmo na sombra."],
  ["Um latido distante", "A noite responde de dentro do bosque.", "Pista 3 de 3 · siga o som até a árvore caída."],
];
let chapterIntroT = 0; // legado mantido para compatibilidade; cartões usam estado explícito.
let narrative = null;
let scene = null;
let victoryScenePending = false;
const ATTACKS = {
  punch: { duration: 12, impact: 9, reach: 36, damage: 1 },
  kick: { duration: 28, impact: 18, reach: 64, damage: 2 },
};

/* Trilha sonora distinta por fase (melodia + baixo + duração do passo) */
const LEVEL_MUSIC = [
  { melody: [523, 659, 784, 659, 587, 698, 880, 698, 659, 784, 988, 784, 523, 440, 392, 0], bass: [131, 165, 196, 147], stepSec: 0.19 },
  { melody: [392, 494, 587, 494, 440, 523, 659, 523, 392, 494, 587, 659, 587, 494, 440, 0], bass: [98, 131, 147, 110], stepSec: 0.16 },
  { melody: [440, 523, 587, 523, 466, 554, 659, 554, 440, 523, 587, 698, 587, 523, 466, 0], bass: [110, 131, 147, 123], stepSec: 0.22 },
  { melody: [349, 440, 523, 440, 392, 466, 587, 466, 349, 440, 523, 622, 523, 440, 392, 0], bass: [87, 110, 131, 98], stepSec: 0.17 },
  { melody: [294, 0, 349, 0, 392, 0, 466, 0, 392, 0, 349, 0, 294, 0, 349, 0], bass: [73, 0, 98, 0], stepSec: 0.24 },
  { melody: [392, 392, 523, 392, 440, 440, 587, 440, 392, 392, 659, 587, 523, 440, 392, 0], bass: [98, 98, 131, 110], stepSec: 0.15 },
  { melody: [523, 523, 659, 523, 698, 659, 784, 659, 523, 523, 659, 784, 880, 784, 659, 0], bass: [131, 131, 165, 175], stepSec: 0.14 },
  { melody: [587, 587, 698, 587, 659, 659, 784, 659, 587, 587, 880, 784, 698, 587, 523, 0], bass: [147, 147, 175, 165], stepSec: 0.13 },
  // --- Mundo 2 (floresta escura, à noite) ---
  { melody: [330, 392, 349, 330, 294, 330, 392, 349, 330, 294, 262, 294, 330, 294, 262, 0], bass: [82, 98, 87, 73], stepSec: 0.20 },
  { melody: [294, 349, 330, 294, 262, 294, 349, 330, 294, 349, 392, 349, 294, 262, 233, 0], bass: [73, 87, 82, 65], stepSec: 0.18 },
  { melody: [349, 415, 392, 349, 330, 349, 415, 392, 349, 415, 466, 415, 392, 349, 311, 0], bass: [87, 104, 98, 78], stepSec: 0.17 },
  { melody: [311, 370, 349, 311, 277, 311, 370, 349, 311, 370, 415, 466, 415, 370, 311, 0], bass: [78, 93, 87, 69], stepSec: 0.16 },
  { melody: [370, 440, 415, 370, 330, 370, 440, 415, 370, 440, 494, 440, 415, 370, 330, 0], bass: [93, 110, 104, 82], stepSec: 0.15 },
  { melody: [330, 392, 370, 330, 311, 330, 392, 370, 330, 392, 440, 494, 466, 415, 349, 0], bass: [82, 98, 93, 78], stepSec: 0.14 },
  // Etapa 15 (índice 14) e Etapa 16/confronto (índice 15) — trocadas de lugar
  // diretamente aqui (antes, um hack trocava os dois índices após a definição).
  { melody: [392, 466, 440, 392, 349, 392, 466, 440, 392, 466, 523, 587, 523, 466, 392, 0], bass: [98, 117, 110, 87], stepSec: 0.13 },
  { melody: [220, 220, 262, 220, 233, 233, 277, 233, 220, 220, 294, 277, 262, 233, 220, 0], bass: [55, 55, 65, 58], stepSec: 0.22 },
];

const INTERLUDE_MUSIC = {
  // Espaçado: deixa o ouvido perceber cada pista antes da próxima.
  melody: [262, 0, 330, 0, 392, 0, 330, 0, 294, 0, 262, 0, 220, 0, 196, 0],
  bass: [65, 0, 73, 0],
  stepSec: 0.30,
};

/* Velocidade dos inimigos cresce por fase */
const PATROL_SPEED = [1.1, 1.5, 2.0, 2.4, 2.8, 2.2, 2.2, 2.3,  2.6, 2.9, 3.1, 3.3, 3.5, 3.2, 3.7, 3.2];
const CHASE_SPEED  = [1.4, 1.9, 2.5, 3.0, 3.4, 2.8, 2.8, 2.9,  3.2, 3.5, 3.8, 4.0, 4.2, 3.8, 4.4, 3.8];
const CHASE_RANGE  = 340;
const ENEMY_W = 40, ENEMY_H = 38;
const COIN_W = 22, COIN_H = 22;
const MINIBOSS_W = 66, MINIBOSS_H = 62, MINIBOSS_HP = 3;

/* Dano genérico a um inimigo: mini-chefe tem HP e pisca; os demais morrem numa tacada só */
function damageEnemy(en, amount) {
  if (en.type === "miniboss") {
    en.hp -= amount;
    en.hitFlash = 10;
    if (en.hp <= 0) en.dead = true;
  } else {
    en.dead = true;
  }
}

function shadowEnemyVulnerable(en) {
  return en.type === "sentinela" ? en.state === "open"
    : en.type === "eco" ? en.state === "cooldown"
      : en.type === "espreita" ? en.state === "exposed" : true;
}

function updateShadowEnemy(en, pCenter) {
  en.stateT++;
  if (en.hitFlash > 0) en.hitFlash--;
  if (en.type === "sentinela") {
    const cycle = en.stateT % 150;
    if (cycle < 76) en.state = "guard";
    else if (cycle < 106) en.state = "windup";
    else en.state = "open";
    en.vulnerable = en.state === "open";
    return;
  }
  if (en.type === "eco") {
    const cycle = en.stateT % 120;
    en.state = cycle < 42 ? "charge" : cycle < 62 ? "wave" : "cooldown";
    en.waveActive = en.state === "wave";
    if (en.state === "wave" && !en.wavePlayed) { en.wavePlayed = true; Sound.echo(); }
    if (en.state !== "wave") en.wavePlayed = false;
    en.vulnerable = en.state === "cooldown";
    return;
  }
  // Espreita só se revela quando o jogador chega perto. As folhas tremem por
  // 45 frames (aprox. 0,75 s) antes da emboscada e ela fica exposta depois.
  if (en.state === "hidden" && Math.abs(pCenter - (en.x + en.w / 2)) < 280) {
    en.state = "tremble"; en.stateT = 0; Sound.rustle();
  } else if (en.state === "tremble" && en.stateT >= 45) {
    en.state = "exposed"; en.stateT = 0; en.vulnerable = true; Sound.sentinel();
  }
}

/* ============================================================
   ESTADO DO JOGO
   ============================================================ */
const STATE = {
  LOADING: 0, TITLE: 1, PLAYING: 2, GAMEOVER: 3, VICTORY: 4, PAUSED: 5, OPTIONS: 6, FIGHT_WON: 7,
  NARRATIVE: 8, CUTSCENE: 9, INTERLUDE: 10,
};
let pauseFocus = 0, pauseConfirm = null, pauseAccept = false;
let optionsFocus = 0; // item focado no menu (0=vidas infinitas, 1=sem morte por queda, 2=voltar)
let titleFocus = 0; // 0 = nova viagem, 1 = replay do interlúdio

function togglePause() {
  if (state === STATE.PLAYING || state === STATE.INTERLUDE) {
    state = STATE.PAUSED;
    pauseFocus = 0; pauseConfirm = null; pauseAccept = false;
    Sound.stopMusic();
  } else if (state === STATE.PAUSED) {
    if (pauseConfirm) { pauseConfirm = null; return; }
    state = bonusActive ? STATE.INTERLUDE : STATE.PLAYING;
    jumpPressed = downPressed = dashPressed = punchPressed = kickPressed = false;
    confirmPressed = anyKey = false;
    Sound.startMusic();
  }
}
let state = STATE.LOADING;

let levelIndex = 0;
let lives = 3;
let cameraX = 0;
let coinsTotal = 0;
let coinsForLife = 0;
let loopCount = 1; // quantas voltas no jogo completo; some no Game Over ou ao recarregar a página

const player = {
  x: 0, y: 0, w: PW, h: PH,
  vx: 0, vy: 0,
  onGround: false,
  facing: 1,        // 1 = direita, -1 = esquerda
  moving: false,
  invuln: 0,        // frames de invulnerabilidade após dano
  coyote: 0,        // pulo tolerante logo após sair de plataforma
  jumps: 0,         // pulos usados no ar (0..2) p/ pulo duplo
  walkPhase: 0,     // fase da animação das patinhas
  form: "betinho",  // "betinho" | "quindim"
  pendingRevert: false, // esperando espaço livre em cima pra voltar a ser Betinho
  dashT: 0,          // frames restantes da investida atual
  dashCooldown: 0,   // frames até poder investir de novo
  dashDir: 1,        // direção travada da investida em curso
  jumpBuffer: 0,     // frames restantes do input buffer de pulo
  pounding: false,   // true durante o mergulho do ground pound
  landingSquashT: 0, // frames de achatamento visual após um pouso forte
  attackT: 0,        // frames restantes da animação de ataque (soco/chute)
  attackType: null,   // "punch" | "kick" | null
  starT: 0,          // frames restantes de invencibilidade (estrela)
  speedBoostT: 0,     // frames restantes de super velocidade
  hasFeather: false, // true com a pena equipada (planar no ar; absorve 1 golpe)
  leader: "betinho", // personagem que conduz a caixa física neste momento
};

const companion = {
  form: "quindim",
  x: 18,
  y: GROUND_Y - 28,
  w: FORM.quindim.w,
  h: FORM.quindim.h,
  facing: 1,
  walkPhase: 0,
};

let enemies = [];   // instâncias da fase atual
let checkpoints = []; // {x, y, on} da fase atual
let coins = [];      // instâncias da fase atual
let quindins = [];   // compatibilidade interna: agora são pontos de troca reutilizáveis
let exchangePoints = quindins;
let stars = [];       // power-ups de invencibilidade temporária
let boosts = [];      // power-ups de super velocidade temporária
let feathers = [];    // power-ups de planar no ar (a Pena)
let movers = [];     // plataformas móveis da fase atual
let tunnels = [];    // túneis (entrada/saída) da fase atual
let respawn = { x: 0, y: 0 }; // ponto de renascimento (início ou checkpoint)
let particles = [];  // partículas de impacto (pisão, dash, ground pound)

/* ---------- Transição fade ---------- */
let fade = { alpha: 0, dir: 0, callback: null, speed: 1 / 30 };
let levelFinishing = false; // true entre tocar a bandeira e o fade concluir a troca de fase
function fadeOut(cb) { fade = { alpha: 0, dir: 1, callback: cb, speed: 1 / 30 }; }
function fadeIn() { fade = { alpha: 1, dir: -1, callback: null, speed: 1 / 30 }; }
function updateFade() {
  if (fade.dir === 0) return;
  fade.alpha += fade.dir * fade.speed;
  if (fade.dir === 1 && fade.alpha >= 1) {
    fade.alpha = 1; fade.dir = 0;
    if (fade.callback) { fade.callback(); fade.callback = null; }
    // Cartões e cenas entram já legíveis: a própria confirmação controla
    // quando a simulação continua, sem um fade ou cronômetro consumindo o
    // tempo de leitura.
    if (state === STATE.NARRATIVE || state === STATE.CUTSCENE) fade = { alpha: 0, dir: 0, callback: null, speed: 1 / 30 };
    else fadeIn();
  } else if (fade.dir === -1 && fade.alpha <= 0) {
    fade.alpha = 0; fade.dir = 0;
  }
}
function drawFade() {
  if (fade.alpha <= 0) return;
  ctx.fillStyle = "rgba(0,0,0," + fade.alpha + ")";
  ctx.fillRect(0, 0, W, H);
}

/* ---------- Toasts (texto na tela) ---------- */
let toastMsg = null, toastT = 0;
function toast(msg, frames) { toastMsg = msg; toastT = frames; }

/* ---------- Partículas (efeitos de impacto) ---------- */
function spawnParticles(x, y, count, color, opts) {
  opts = opts || {};
  const life = opts.life || 16, speed = opts.speed || 3, r = opts.r || 3;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const spd = speed * (0.4 + Math.random() * 0.8);
    particles.push({
      x, y,
      vx: Math.cos(a) * spd,
      vy: Math.sin(a) * spd - speed * 0.3,
      life, maxLife: life,
      color, r: r * (0.6 + Math.random() * 0.8),
    });
  }
}
function updateParticles() {
  for (const p of particles) { p.x += p.vx; p.y += p.vy; p.vy += 0.25; p.life--; }
  particles = particles.filter((p) => p.life > 0);
}
function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/* ---------- Túneis: dimensões e transição ---------- */
const PIPE_W = 34, PIPE_H = 46;
const TUNNEL_ANIM_FRAMES = 24;
let tunnelAnim = null; // {phase:'in'|'out', t, from, to}
let tunnelDenyCooldown = 0;
let playerVisualScaleY = 1;

function tunnelEntranceCheck(lv) {
  const pCenter = player.x + player.w / 2;
  const feetY = player.y + player.h;
  for (const t of (lv.tunnels || [])) {
    if (t.exit == null) continue; // só entradas
    if (Math.abs(pCenter - (t.x + PIPE_W / 2)) < PIPE_W / 2 + 4 && Math.abs(feetY - t.y) < 6) {
      return t;
    }
  }
  return null;
}

function startTunnelTransition(entryTunnel, lv) {
  const exitTunnel = (lv.tunnels || []).find((x) => x.id === entryTunnel.exit);
  if (!exitTunnel) return;
  player.x = entryTunnel.x + PIPE_W / 2 - player.w / 2;
  tunnelAnim = { phase: "in", t: 0, from: entryTunnel, to: exitTunnel };
  player.vx = 0; player.vy = 0;
  player.pendingRevert = false; // recomeça "limpo" do outro lado do túnel
  Sound.slide(500, 120, 0.4);
}

function updateTunnelAnim(lv) {
  const a = tunnelAnim;
  a.t++;
  if (a.phase === "in") {
    playerVisualScaleY = Math.max(0, 1 - a.t / TUNNEL_ANIM_FRAMES);
    if (a.t >= TUNNEL_ANIM_FRAMES) {
      player.x = a.to.x + PIPE_W / 2 - player.w / 2;
      player.y = a.to.y - player.h;
      a.phase = "out";
      a.t = 0;
      Sound.slide(120, 500, 0.4);
    }
  } else {
    playerVisualScaleY = Math.min(1, a.t / TUNNEL_ANIM_FRAMES);
    if (a.t >= TUNNEL_ANIM_FRAMES) {
      tunnelAnim = null;
      playerVisualScaleY = 1;
      player.invuln = Math.max(player.invuln, 40);
    }
  }
  const target = Math.max(0, Math.min(player.x + player.w / 2 - W / 2, lv.worldW - W));
  cameraX += (target - cameraX) * 0.15;
}

function loadLevel(i) {
  const lv = currentLevel();
  if (!bonusActive) saveBestLevel(i + 1);
  levelFinishing = false;
  chapterIntroT = 0;
  hitFreeze = 0; screenShake = 0;
  Sound.stopMusic();
  const music = bonusActive ? INTERLUDE_MUSIC : LEVEL_MUSIC[i];
  if (music) Sound.startMusic(music.melody, music.bass, music.stepSec);
  player.x = lv.start.x;
  player.y = lv.start.y;
  player.vx = 0; player.vy = 0;
  player.onGround = false;
  player.jumps = 0; player.coyote = 0; player.jumpBuffer = 0;
  player.facing = 1;
  player.invuln = 0;
  player.form = "betinho";
  player.leader = "betinho";
  player.w = FORM.betinho.w;
  player.h = FORM.betinho.h;
  player.pendingRevert = false;
  player.dashT = 0; player.dashCooldown = 0; player.pounding = false; player.landingSquashT = 0;
  player.attackT = 0; player.attackType = null;
  player.starT = 0; player.speedBoostT = 0; player.hasFeather = false;
  companion.form = "quindim";
  companion.w = FORM.quindim.w;
  companion.h = FORM.quindim.h;
  companion.x = player.x - 46;
  companion.y = lv.start.y + PH - companion.h;
  companion.facing = 1;
  cameraX = 0;
  toastMsg = null; toastT = 0;
  tunnelAnim = null; playerVisualScaleY = 1; tunnelDenyCooldown = 0;
  particles = [];

  if (modeKeyOf(lv) === "fight") {
    enemies = []; checkpoints = []; coins = []; quindins = []; exchangePoints = []; movers = []; tunnels = [];
    stars = []; boosts = []; feathers = [];
    respawn = { x: lv.start.x, y: lv.start.y };
    initFight();
    return;
  }

  enemies = (lv.enemies || []).map((e) => {
    if (e.type === "flyer") {
      return { type: "flyer", x: e.x, y: e.y, baseY: e.y, w: ENEMY_W, h: ENEMY_H, minX: e.minX, maxX: e.maxX, dir: -1, wob: Math.random() * Math.PI * 2, bobAmp: e.bobAmp || 24, hitFlash: 0 };
    }
    if (e.type === "miniboss") {
      return { type: "miniboss", x: e.x, y: GROUND_Y - MINIBOSS_H, w: MINIBOSS_W, h: MINIBOSS_H, minX: e.minX, maxX: e.maxX, dir: -1, wob: Math.random() * Math.PI * 2, hp: MINIBOSS_HP, maxHp: MINIBOSS_HP, hitFlash: 0 };
    }
    if (["sentinela", "eco", "espreita"].includes(e.type)) {
      const data = {
        sentinela: { w: 46, h: 54 },
        eco: { w: 42, h: 40 },
        espreita: { w: 44, h: 38 },
      }[e.type];
      return {
        type: e.type, x: e.x, y: e.surfaceY - data.h, w: data.w, h: data.h,
        minX: e.minX, maxX: e.maxX, dir: -1, wob: Math.random() * Math.PI * 2,
        state: e.type === "espreita" ? "hidden" : "guard", stateT: 0,
        vulnerable: e.type === "espreita" ? false : false, hitFlash: 0,
        waveActive: false, wavePlayed: false,
      };
    }
    return { type: e.type, x: e.x, y: e.surfaceY - ENEMY_H, w: ENEMY_W, h: ENEMY_H, minX: e.minX, maxX: e.maxX, dir: -1, wob: Math.random() * Math.PI * 2, hitFlash: 0 };
  });
  checkpoints = (lv.checkpoints || []).map((cx) => ({ x: cx, y: GROUND_Y - PH, on: false }));
  coins = (lv.coins || []).map((c) => ({ x: c.x, y: c.y, w: COIN_W, h: COIN_H, got: false, wob: Math.random() * Math.PI * 2 }));
  exchangePoints = (lv.exchangePoints || lv.quindins || []).map((q) => ({ x: q.x, y: q.y, w: 32, h: 32, cooldown: 0, armed: true, wob: Math.random() * Math.PI * 2, lastLeader: "betinho" }));
  quindins = exchangePoints;
  stars = (lv.stars || []).map((s) => ({ x: s.x, y: s.y, w: 26, h: 26, got: false, wob: Math.random() * Math.PI * 2 }));
  boosts = (lv.boosts || []).map((b) => ({ x: b.x, y: b.y, w: 24, h: 24, got: false, wob: Math.random() * Math.PI * 2 }));
  feathers = (lv.feathers || []).map((f) => ({ x: f.x, y: f.y, w: 22, h: 26, got: false, wob: Math.random() * Math.PI * 2 }));
  movers = (lv.movers || []).map((m) => ({ ...m, baseX: m.x, baseY: m.y, dir: 1, dx: 0, dy: 0 }));
  tunnels = (lv.tunnels || []).map((t) => ({ ...t }));
  respawn = { x: lv.start.x, y: lv.start.y };
}

function startGame(startLevel = 0) {
  bonusActive = false;
  activeChapter = { kind: "stage", id: startLevel + 1, position: startLevel + 1 };
  interlude = null;
  narrative = null;
  scene = null;
  victoryScenePending = false;
  levelIndex = startLevel;
  lives = 3;
  coinsTotal = 0;
  coinsForLife = 0;
  loadLevel(levelIndex);
  state = STATE.PLAYING;
}

function beginStage(index, showCard = true) {
  bonusActive = false;
  levelIndex = index;
  activeChapter = { kind: "stage", id: index + 1, position: index + 1 };
  interlude = null;
  scene = null;
  loadLevel(index);
  if (showCard) {
    enterNarrative({ kind: "stage", stageIndex: index, guard: 60 });
  } else {
    state = STATE.PLAYING;
    Sound.startMusic();
  }
}

function beginCampaign() {
  lives = 3;
  coinsTotal = 0;
  coinsForLife = 0;
  victoryScenePending = false;
  beginStage(0, true);
}

function returnToTitle() {
  bonusActive = false;
  activeChapter = { kind: "stage", id: 1, position: 1 };
  interlude = null;
  narrative = null;
  scene = null;
  levelFinishing = false;
  loadLevel(0);
  Sound.stopMusic();
  state = STATE.TITLE;
}

function startInterlude({ replay = false } = {}) {
  bonusActive = true;
  activeChapter = { kind: "interlude", id: BONUS_ID, position: 8.5 };
  levelIndex = CAMPAIGN_FLOW.interludeAfter; // referência visual: ruptura entre 8 e 9
  interlude = {
    replay,
    clueIndex: 0,
    clues: [
      { kind: "pegada", x: 520, y: 444, w: 34, h: 24, found: false },
      { kind: "tufo", x: 1120, y: 410, w: 30, h: 30, found: false },
      { kind: "latido", x: 1770, y: 432, w: 34, h: 34, found: false },
    ],
    rescueReady: false,
  };
  narrative = null;
  scene = null;
  loadLevel(levelIndex);
  if (replay) { lives = 3; coinsTotal = 0; coinsForLife = 0; }
  enterNarrative({ kind: "interlude", guard: 60 });
}

function enterNarrative(data) {
  narrative = { ...data, guard: data.guard == null ? 60 : data.guard };
  state = STATE.NARRATIVE;
  Sound.stopMusic();
}

function beginScene(kind) {
  scene = { kind, guard: 60 };
  state = STATE.CUTSCENE;
  Sound.stopMusic();
}

/* Perde uma vida: reposiciona no início ou vai p/ game over */
function loseLife() {
  if (!assist.infiniteLives) lives--;
  Sound.hurt();
  if (lives <= 0 && !assist.infiniteLives) {
    levelFinishing = true;
    fadeOut(() => { state = STATE.GAMEOVER; Sound.stopMusic(); Sound.gameover(); });
  } else {
    const lv = currentLevel();
    player.x = respawn.x;      // último checkpoint (ou início)
    player.y = respawn.y;
    player.vx = 0; player.vy = 0;
    player.form = "betinho";
    player.leader = "betinho";
    player.w = FORM.betinho.w;
    player.h = FORM.betinho.h;
    player.pendingRevert = false;
    player.dashT = 0; player.dashCooldown = 0; player.pounding = false; player.landingSquashT = 0;
    player.attackT = 0; player.attackType = null;
    player.starT = 0; player.speedBoostT = 0; player.hasFeather = false;
    tunnelAnim = null; playerVisualScaleY = 1;
    player.invuln = 100;
    companion.form = "quindim";
    companion.w = FORM.quindim.w;
    companion.h = FORM.quindim.h;
    companion.x = player.x - 46;
    companion.y = player.y + player.h - companion.h;
    for (const q of exchangePoints) { q.cooldown = 0; q.armed = true; }
    if (bonusActive && interlude) {
      // A pista atual continua encontrada; o respawn já é o último marco.
      for (let i = 0; i < interlude.clues.length; i++) interlude.clues[i].found = i < interlude.clueIndex;
    }
    cameraX = Math.max(0, Math.min(respawn.x + PW / 2 - W / 2, lv.worldW - W));
  }
}

/* ============================================================
   MODOS DE GAMEPLAY — registro único (auditoria M4)
   ============================================================ */
// Cada capítulo jogável é um modo (plataforma, interlúdio, arena). O resto do
// código consulta MODES/modeInfo() em vez de espalhar if (type === "fight") e
// if (bonusActive). Um modo novo (ex.: corrida) é uma linha no registro + sua
// própria lógica — o despacho, a UI de fora e os fatos de entrada não mudam.
function modeKeyOf(lv) {
  return lv.type === "fight" ? "fight" : lv.type === "interlude" ? "interlude" : "platform";
}
function chapterMode() {
  return bonusActive ? "interlude" : modeKeyOf(currentLevel());
}
const MODES = {
  platform:  { update: updatePlayingCore, draw: drawStageWorld, isArena: false },
  interlude: { update: updateInterlude,   draw: drawStageWorld, isArena: false },
  fight:     { update: updateFight,       draw: drawFight,      isArena: true },
};
function modeInfo() {
  const m = chapterMode();
  return { mode: m, isArena: MODES[m].isArena };
}

/* ============================================================
   ATUALIZAÇÃO (passo fixo)
   ============================================================ */

/* Um passo de movimento do jogador — núcleo ÚNICO para os modos plataforma,
   interlúdio e arena (antes, cada um tinha sua cópia, e as cópias já tinham
   divergido: squash de aterrissagem, cooldown do dash, animação de passada
   ausente no interlúdio). Regras comuns: dash, mergulho, pulo duplo com
   coyote/buffer, gravidade, planar com a Pena e integração X/Y contra o
   ambiente.

   env = {
     solids:     null | retângulos   // plataforma/interlúdio: sólidos + movers
     floorY:     null | número       // arena: chão infinito (sem sólidos)
     minX, maxX                      // limites horizontais: [minX, maxX - player.w]
     dashCd:     30 (plataforma) | 45 (arena/esquiva)
     dashInvuln: true na arena       // esquiva concede i-frames
     dashGate:   true na arena       // dash exige attackT === 0
     dashPuff:   true na plataforma  // partículas visuais do dash
   }
   Retorna { prevVy, wasPounding, prevFeet } para o chamador aplicar os
   efeitos de pouso/contato específicos de cada modo. */
function stepPlayer(env) {
  const moveSpeed = player.speedBoostT > 0 ? MOVE_SPEED * 1.6 : MOVE_SPEED;
  player.vx = 0;
  if (keys.left  || pad.left  || touch.left)  { player.vx = -moveSpeed; player.facing = -1; }
  if (keys.right || pad.right || touch.right) { player.vx =  moveSpeed; player.facing =  1; }
  player.moving = player.vx !== 0 && !player.pounding;

  // --- Dash (investida horizontal / esquiva na arena) ---
  if (player.dashCooldown > 0) player.dashCooldown--;
  if (dashPressed && player.dashCooldown === 0 && player.dashT === 0 && !player.pounding
      && !(env.dashGate && player.attackT > 0)) {
    player.dashDir = player.facing;
    player.dashT = DASH_FRAMES;
    player.dashCooldown = env.dashCd;
    if (env.dashInvuln) player.invuln = Math.max(player.invuln, DASH_FRAMES);
    Sound.dash();
    if (env.dashPuff) spawnParticles(player.x + player.w / 2 - player.dashDir * player.w * 0.4, player.y + player.h - 8, 6, "#ffffff", { speed: 2, life: 12, r: 2 });
  }
  if (player.dashT > 0) {
    player.dashT--;
    player.vx = player.dashDir * DASH_SPEED;
    player.moving = true;
  }

  // --- Ground pound: ↓ no ar dispara um mergulho rápido ---
  if (downPressed && !player.onGround && !player.pounding) {
    player.pounding = true;
    player.dashT = 0;
    player.vy = GROUND_POUND_SPEED;
    Sound.groundPound();
  }
  if (player.pounding) { player.vx = 0; player.moving = false; }

  // --- Pulo (coyote time + pulo duplo + input buffer) ---
  if (player.onGround) { player.coyote = 6; player.jumps = 0; }
  else if (player.coyote > 0) player.coyote--;
  if (jumpPressed) player.jumpBuffer = 8;
  else if (player.jumpBuffer > 0) player.jumpBuffer--;
  if (player.jumpBuffer > 0) {
    const jumpVel = FORM[player.form].jump;
    if (player.coyote > 0) {
      player.vy = jumpVel;
      player.onGround = false;
      player.coyote = 0;
      player.jumps = 1;
      player.jumpBuffer = 0;
      Sound.jump();
    } else if (jumpPressed && player.jumps < 2) {
      player.vy = jumpVel * 0.92;
      player.jumps = 2;
      player.jumpBuffer = 0;
      Sound.doubleJump();
    }
  }
  jumpPressed = false;

  // --- Animação das patinhas (só andando no chão) ---
  if (player.moving && player.onGround) player.walkPhase += 0.35;
  else player.walkPhase = 0;

  // --- Gravidade (sem limite durante o mergulho) ---
  player.vy += GRAVITY;
  if (!player.pounding && player.vy > MAX_FALL) player.vy = MAX_FALL;

  // --- Planar com a Pena: segurar pular no ar freia a queda ---
  if (player.hasFeather && !player.onGround && !player.pounding && player.vy > 1.5 && (keys.jump || pad.jump || touch.jump)) {
    player.vy = 1.5;
  }

  // --- Colisão eixo X ---
  player.x += player.vx;
  if (env.solids) {
    for (const s of env.solids) {
      if (aabb(player, s)) {
        if (player.vx > 0) player.x = s.x - player.w;
        else if (player.vx < 0) player.x = s.x + s.w;
      }
    }
  }
  if (player.x < env.minX) player.x = env.minX;
  if (player.x + player.w > env.maxX) player.x = env.maxX - player.w;

  // --- Colisão eixo Y ---
  const prevVy = player.vy;
  const wasPounding = player.pounding;
  const prevFeet = player.y + player.h;
  player.onGround = false;
  player.y += player.vy;
  if (env.floorY != null) {
    if (player.y + player.h >= env.floorY) {
      player.y = env.floorY - player.h;
      player.vy = 0;
      player.onGround = true;
    }
  } else {
    for (const s of env.solids) {
      if (aabb(player, s)) {
        if (player.vy > 0) {
          player.y = s.y - player.h;
          player.vy = 0;
          player.onGround = true;
          if (s.axis) player.x += s.dx;
        } else if (player.vy < 0) {
          player.y = s.y + s.h;
          player.vy = 0;
        }
      }
    }
  }
  return { prevVy, wasPounding, prevFeet };
}

/* Pouso de um mergulho na plataforma/interlúdio: impacto visual/sonoro + dano
   em área nos inimigos do mesmo andar. Unificado com o filtro sameFloor — o
   interlúdio não tinha o filtro e podia acertar inimigos no chão a partir de
   uma plataforma alta, só pela distância horizontal. */
function poundLandingAOE() {
  player.pounding = false;
  player.landingSquashT = 10;
  addShake(8);
  hitFreeze = Math.max(hitFreeze, 4);
  Sound.poundLand();
  spawnParticles(player.x + player.w / 2, player.y + player.h, 12, "#c9a35a", { speed: 5, life: 20, r: 4 });
  for (const en of enemies) {
    const sameFloor = Math.abs((en.y + en.h) - (player.y + player.h)) < 30;
    const shadowOpen = !["sentinela", "eco", "espreita"].includes(en.type) || shadowEnemyVulnerable(en);
    if (!en.dead && shadowOpen && sameFloor && Math.abs((en.x + en.w / 2) - (player.x + player.w / 2)) < POUND_AOE_RADIUS) {
      damageEnemy(en, 2);
      Sound.stomp();
      spawnParticles(en.x + en.w / 2, en.y + en.h / 2, 6, "#ffd54d", { speed: 3, life: 14, r: 3 });
      if (en.type === "miniboss" && en.dead) {
        coinsTotal += 5; coinsForLife += 5;
        addShake(10);
        spawnParticles(en.x + en.w / 2, en.y + en.h / 2, 18, "#ffd54d", { speed: 6, life: 22, r: 5 });
      }
    }
  }
  enemies = enemies.filter((e) => !e.dead);
}

function updatePlaying() {
  // Despacho pelo registro de modos (auditoria M4): a arena e o interlúdio
  // têm entradas em MODES; um modo novo entra lá, não num if novo aqui.
  if (levelFinishing) return; // congela a simulação durante o fade de troca
  MODES[chapterMode()].update();
}

/* Travessia de uma Etapa numerada — modo plataforma */
function updatePlayingCore() {
  const lv = currentLevel();
  if (levelFinishing) return;

  if (toastT > 0) { toastT--; if (toastT <= 0) toastMsg = null; }
  if (tunnelDenyCooldown > 0) tunnelDenyCooldown--;
  if (hitFreeze > 0) { hitFreeze--; return; } // congelamento curto de impacto (pisão forte, ground pound)

  if (tunnelAnim) { updateTunnelAnim(lv); return; }
  playerVisualScaleY = 1;
  updateParticles();

  // --- Plataformas móveis: ping-pong entre base e base+range ---
  for (const m of movers) {
    const prevX = m.x, prevY = m.y;
    if (m.axis === "x") {
      m.x += m.dir * m.speed;
      if (m.x <= m.baseX) { m.x = m.baseX; m.dir = 1; }
      if (m.x >= m.baseX + m.range) { m.x = m.baseX + m.range; m.dir = -1; }
    } else {
      m.y += m.dir * m.speed;
      if (m.y <= m.baseY) { m.y = m.baseY; m.dir = 1; }
      if (m.y >= m.baseY + m.range) { m.y = m.baseY + m.range; m.dir = -1; }
    }
    m.dx = m.x - prevX;
    m.dy = m.y - prevY;
  }

  // --- Reverter pro Betinho assim que houver espaço livre em cima ---
  if (player.pendingRevert && canGrowToBetinho(lv)) {
    setForm("betinho");
    player.pendingRevert = false;
  }

  // --- Jogador: um passo de movimento (núcleo único; ver stepPlayer) ---
  const step = stepPlayer({
    solids: lv.solids.concat(movers),
    minX: 0,
    maxX: lv.worldW,
    dashCd: DASH_COOLDOWN,
    dashPuff: true,
  });
  const prevVy = step.prevVy;
  const wasPounding = step.wasPounding;
  if (!wasPounding && prevVy > 6 && player.onGround && player.landingSquashT === 0) player.landingSquashT = 5;

  // --- Pouso do ground pound: impacto visual/sonoro + derruba inimigos por perto ---
  if (wasPounding && player.onGround) poundLandingAOE();

  // --- Caiu no buraco ---
  if (player.y > H + 80) {
    if (assist.noFallDeath) {
      player.x = respawn.x; player.y = respawn.y;
      player.vx = 0; player.vy = 0;
      player.form = "betinho"; player.leader = "betinho"; player.w = FORM.betinho.w; player.h = FORM.betinho.h;
      player.pendingRevert = false; player.dashT = 0; player.dashCooldown = 0;
      player.pounding = false; player.landingSquashT = 0;
      player.invuln = 60;
      cameraX = Math.max(0, Math.min(respawn.x + PW / 2 - W / 2, lv.worldW - W));
      Sound.hurt();
    } else {
      loseLife();
    }
    return;
  }

  // --- Invulnerabilidade ---
  if (player.invuln > 0) player.invuln--;

  // --- Entrada de túnel (segurando ↓; exige o líder menor) ---
  if ((keys.down || pad.down || touch.down) && player.onGround) {
    const t = tunnelEntranceCheck(lv);
    if (t) {
      if (player.form === "quindim") {
        startTunnelTransition(t, lv);
      } else if (tunnelDenyCooldown === 0) {
        toast("Grande demais. Procure um ponto TROCA", 120);
        Sound.blip(160, 0.15);
        tunnelDenyCooldown = 60;
      }
    }
  }
  if (tunnelAnim) return; // transição começou agora mesmo

  // --- Inimigos ---
  const pSpeed = PATROL_SPEED[levelIndex];
  const cSpeed = CHASE_SPEED[levelIndex];
  const pCenter = player.x + player.w / 2;

  for (const en of enemies) {
    en.wob += 0.15;
    if (en.hitFlash > 0) en.hitFlash--;
    if (["sentinela", "eco", "espreita"].includes(en.type)) {
      updateShadowEnemy(en, pCenter);
      if (en.type === "eco" && en.waveActive && aabb(player, { x: en.x - 150, y: en.y + en.h - 18, w: en.w + 300, h: 18 }) && player.invuln === 0 && player.starT === 0) {
        loseLife(); return;
      }
    } else if (en.type === "patrol") {
      en.x += en.dir * pSpeed;
      if (en.x <= en.minX) { en.x = en.minX; en.dir = 1; }
      if (en.x + en.w >= en.maxX) { en.x = en.maxX - en.w; en.dir = -1; }
    } else if (en.type === "flyer") {
      en.x += en.dir * (pSpeed * 0.8);
      if (en.x <= en.minX) { en.x = en.minX; en.dir = 1; }
      if (en.x + en.w >= en.maxX) { en.x = en.maxX - en.w; en.dir = -1; }
      en.y = en.baseY + Math.sin(en.wob) * en.bobAmp;
    } else if (en.type === "miniboss") {
      const mSpeed = pSpeed * 0.6;
      en.x += en.dir * mSpeed;
      if (en.x <= en.minX) { en.x = en.minX; en.dir = 1; }
      if (en.x + en.w >= en.maxX) { en.x = en.maxX - en.w; en.dir = -1; }
    } else { // chase
      const eCenter = en.x + en.w / 2;
      if (Math.abs(pCenter - eCenter) < CHASE_RANGE) {
        const move = Math.sign(pCenter - eCenter) * cSpeed;
        en.x += move;
        en.dir = Math.sign(move) || en.dir;
      } else {
        // vagueia devagar quando o jogador está longe
        en.x += en.dir * (cSpeed * 0.4);
      }
      if (en.x < en.minX) { en.x = en.minX; en.dir = 1; }
      if (en.x + en.w > en.maxX) { en.x = en.maxX - en.w; en.dir = -1; }
    }

    // Contato: pisar em cima derrota (ou tira 1 HP do mini-chefe); toque lateral tira vida
    if (aabb(player, en)) {
      const feet = player.y + player.h;
      const fromAbove = (prevVy > 0 || wasPounding) && (feet - en.y) < 20;
      const invincible = player.starT > 0;
      const shadow = ["sentinela", "eco", "espreita"].includes(en.type);
      const shadowOpen = !shadow || shadowEnemyVulnerable(en);
      const dashHit = player.dashT > 0 && shadowOpen;
      if ((fromAbove && shadowOpen) || dashHit) {
        damageEnemy(en, 1);
        player.vy = -8;      // quica após pisar
        Sound.stomp();
        addShake(5);
        spawnParticles(en.x + en.w / 2, en.y + en.h / 2, 8, "#ffd54d", { speed: 4, life: 16, r: 3 });
        if (en.type === "miniboss" && en.dead) {
          coinsTotal += 5; coinsForLife += 5;
          addShake(10);
          spawnParticles(en.x + en.w / 2, en.y + en.h / 2, 18, "#ffd54d", { speed: 6, life: 22, r: 5 });
        }
      } else if (invincible && en.type !== "miniboss" && shadowOpen) {
        // Estrela: derrota qualquer inimigo comum só de encostar
        damageEnemy(en, 99);
        Sound.stomp();
        addShake(4);
        spawnParticles(en.x + en.w / 2, en.y + en.h / 2, 8, "#ffd54d", { speed: 4, life: 16, r: 3 });
      } else if (player.invuln === 0 && !invincible) {
        if (player.hasFeather) {
          player.hasFeather = false;
          player.invuln = 100;
          Sound.hurt();
          toast("PERDEU A PENA!", 90);
        } else {
          loseLife();
          return;
        }
      }
    }
  }
  enemies = enemies.filter((e) => !e.dead); // remove pisados e os derrotados no toque pela estrela

  // --- Pontos de troca: ficam no mundo e podem ser usados várias vezes ---
  for (const point of exchangePoints) {
    if (point.cooldown > 0) point.cooldown--;
    if (!aabb(player, point)) point.armed = true;
    if (aabb(player, point)) touchExchangePoint(point);
  }

  // --- Checkpoints ---
  for (const cp of checkpoints) {
    if (!cp.on && player.x + player.w / 2 >= cp.x) {
      cp.on = true;
      respawn = { x: cp.x - PW / 2, y: GROUND_Y - PH };
      Sound.checkpoint();
    }
  }

  // --- Moedas ---
  for (const c of coins) {
    if (!c.got && aabb(player, c)) {
      c.got = true;
      coinsTotal++;
      coinsForLife++;
      Sound.coin();
      if (coinsForLife >= 20) {
        coinsForLife -= 20;
        lives++;
        Sound.oneUp();
      }
    }
  }

  // --- Estrela (invencibilidade temporária) ---
  for (const s of stars) {
    if (!s.got && aabb(player, s)) {
      s.got = true;
      player.starT = 480;
      Sound.powerup();
      toast("ESTRELA! INVENCÍVEL!", 120);
    }
  }

  // --- Boost (super velocidade temporária) ---
  for (const b of boosts) {
    if (!b.got && aabb(player, b)) {
      b.got = true;
      player.speedBoostT = 360;
      Sound.powerup();
      toast("SUPER VELOCIDADE!", 120);
    }
  }

  // --- Pena (planar no ar; absorve 1 golpe) ---
  for (const f of feathers) {
    if (!f.got && aabb(player, f)) {
      f.got = true;
      player.hasFeather = true;
      Sound.powerup();
      toast("VOCÊ PEGOU A PENA!", 150);
    }
  }
  if (player.starT > 0) player.starT--;
  if (player.speedBoostT > 0) player.speedBoostT--;

  // --- Chegou na bandeira ---
  // levelFinishing trava o resto da simulação (física/movimento) até o fade
  // concluir e loadLevel() rodar. Sem isso: (1) a condição continua verdadeira
  // por vários frames, chamando fadeOut() de novo a cada um deles - o que
  // reseta fade.alpha pra 0 e nunca deixa a transição terminar (tela "travada"
  // com levelUp() tocando em loop); e (2) mesmo só corrigindo o reset, o
  // jogador continuaria andando por até ~0.5s de fade e podia cair num vão
  // logo depois da bandeira (fase 6, por ex.) antes da próxima fase carregar,
  // morrendo bem depois do último checkpoint.
  if (player.x + player.w >= lv.goalX && !levelFinishing) {
    levelFinishing = true;
    player.vx = 0; player.vy = 0;
    if (levelIndex === CAMPAIGN_FLOW.interludeAfter) {
      fadeOut(() => { levelFinishing = false; beginScene("separation"); });
    } else if (levelIndex >= CAMPAIGN_FLOW.lastStage) {
      fadeOut(() => { state = STATE.VICTORY; victoryScenePending = true; loopCount++; Sound.stopMusic(); Sound.victory(); });
    } else {
      Sound.levelUp();
      const next = levelIndex + 1;
      fadeOut(() => { beginStage(next, true); });
    }
    return;
  }

  // --- Câmera segue o jogador ---
  let target = player.x + player.w / 2 - W / 2;
  cameraX = Math.max(0, Math.min(target, lv.worldW - W));
}

/* ---------- Interlúdio: O rastro de Quindim ---------- */
function updateInterlude() {
  const lv = BONUS_LEVEL;
  if (!interlude || levelFinishing) return;
  updateParticles();
  for (const point of exchangePoints) if (point.cooldown > 0) point.cooldown--;
  if (player.invuln > 0) player.invuln--;

  // --- Jogador: um passo de movimento (núcleo único; ver stepPlayer) ---
  const step = stepPlayer({
    solids: lv.solids.concat(movers),
    minX: 0,
    maxX: lv.worldW,
    dashCd: DASH_COOLDOWN,
  });
  const previousFeet = step.prevFeet;
  const prevVy = step.prevVy;
  const wasPounding = step.wasPounding;
  if (!wasPounding && prevVy > 6 && player.onGround && player.landingSquashT === 0) player.landingSquashT = 5;
  if (wasPounding && player.onGround) poundLandingAOE();
  if (player.y > H + 80) { loseLife(); return; }

  const pCenter = player.x + player.w / 2;
  for (const en of enemies) {
    updateShadowEnemy(en, pCenter);
    if (en.type === "eco" && en.waveActive) {
      const wave = { x: en.x - 150, y: en.y + en.h - 18, w: en.w + 300, h: 18 };
      if (aabb(player, wave) && player.invuln === 0 && player.starT === 0) {
        loseLife(); return;
      }
    }
    if (!aabb(player, en) || en.dead) continue;
    const fromAbove = (prevVy > 0 || wasPounding) && (previousFeet - en.y) < 20;
    const attackWindow = shadowEnemyVulnerable(en);
    const attacking = player.dashT > 0 || player.pounding || player.starT > 0;
    if (fromAbove && attackWindow || attacking && attackWindow) {
      damageEnemy(en, 1); player.vy = -8; Sound.stomp(); spawnParticles(en.x + en.w / 2, en.y + en.h / 2, 8, "#ffcc6b", { speed: 3, life: 14, r: 3 });
    } else if (player.invuln === 0 && player.starT === 0) {
      loseLife(); return;
    }
  }
  enemies = enemies.filter((en) => !en.dead);

  for (const point of exchangePoints) {
    if (!aabb(player, point)) point.armed = true;
    if (aabb(player, point)) touchExchangePoint(point);
  }
  const clue = interlude.clues[interlude.clueIndex];
  if (clue && aabb(player, clue)) {
    clue.found = true;
    interlude.clueIndex++;
    const cp = checkpoints[Math.min(interlude.clueIndex - 1, checkpoints.length - 1)];
    if (cp) { cp.on = true; respawn = { x: cp.x - PW / 2, y: GROUND_Y - PH }; }
    Sound.clue(clue.kind);
    toast(clue.kind === "pegada" ? "Uma pegada" : clue.kind === "tufo" ? "Um tufo dourado" : "Um latido!", 110);
    if (interlude.clueIndex >= interlude.clues.length) {
      interlude.rescueReady = true;
      saveReplayInterlude();
      if (interlude.replay) returnToTitle();
      else beginScene("reunion");
      return;
    }
  }
  if (player.starT > 0) player.starT--;
  if (player.speedBoostT > 0) player.speedBoostT--;
  const target = player.x + player.w / 2 - W / 2;
  cameraX = Math.max(0, Math.min(target, lv.worldW - W));
}

/* ============================================================
   FASE DE LUTA (Fase 7) - arena estilo Street Fighter
   ============================================================ */
const BOSS_W = 60, BOSS_H = 90;
const FIGHT_MAX_HP = 8;
const FIGHT_TIME = 60 * 60; // 60s a 60fps
let fight = null;
let fightCrowdCache = null;
let screenShake = 0; // magnitude do tremor de tela; decai sozinho a cada desenho
let hitFreeze = 0;   // frames de "congelamento" de impacto (feedback de golpe forte)

function addShake(amount) { screenShake = Math.max(screenShake, amount); }

function getFightCrowd() {
  if (!fightCrowdCache) {
    fightCrowdCache = Array.from({ length: 46 }, () => ({
      x: 30 + Math.random() * (W - 60),
      y: 46 + Math.random() * 50,
      phase: Math.random() * Math.PI * 2,
      hue: Math.floor(Math.random() * 360),
    }));
  }
  return fightCrowdCache;
}

function initFight() {
  player.x = 120; player.y = GROUND_Y - player.h;
  player.vx = 0; player.vy = 0; player.onGround = true; player.facing = 1;
  player.dashT = 0; player.dashCooldown = 0; player.pounding = false; player.landingSquashT = 0;
  player.attackT = 0; player.attackType = null;
  const bossCfg = currentLevel().boss || { name: "BOXEADOR", color: "#c62828", colorHot: "#ff6b6b" };
  fight = {
    round: 1, wins: 0,
    playerHP: FIGHT_MAX_HP, bossHP: FIGHT_MAX_HP,
    timer: FIGHT_TIME,
    speedMul: 1,
    hookTelegraph: 26,
    bossName: bossCfg.name,
    bossColor: bossCfg.color,
    bossColorHot: bossCfg.colorHot,
    boss: { x: W - 200, y: GROUND_Y - BOSS_H, w: BOSS_W, h: BOSS_H, state: "approach", stateT: 0, dir: -1, glove: 0, doubleDmg: false, hitFlash: 0, stompCooldown: 0 },
    quindim: { x: 70, y: GROUND_Y - 26, w: 32, h: 32, active: true, cd: 0, armed: true },
    roundOverlayT: 150,
    roundOverlayText: "O guardião do portão",
    crowd: getFightCrowd(),
  };
  Sound.bell();
}

function resetRoundHP() {
  fight.playerHP = FIGHT_MAX_HP;
  fight.bossHP = FIGHT_MAX_HP;
  fight.timer = FIGHT_TIME;
  fight.boss.x = W - 200; fight.boss.y = GROUND_Y - BOSS_H;
  fight.boss.state = "approach"; fight.boss.stateT = 0; fight.boss.doubleDmg = false; fight.boss.glove = 0; fight.boss.stompCooldown = 0;
  player.x = 120; player.y = GROUND_Y - player.h; player.vx = 0; player.vy = 0;
  player.dashT = 0; player.dashCooldown = 0; player.pounding = false; player.landingSquashT = 0;
  player.attackT = 0; player.attackType = null;
}

function endRound(playerWon) {
  Sound.bell();
  if (playerWon) {
    fight.wins++;
    if (fight.wins >= 2) {
      Sound.ko();
      addShake(18);
      state = levelIndex === CAMPAIGN_FLOW.lastStage ? STATE.VICTORY : STATE.FIGHT_WON;
      if (state === STATE.VICTORY) { victoryScenePending = true; loopCount++; Sound.victory(); }
      Sound.stopMusic();
      return;
    }
    fight.round++;
    fight.speedMul *= 1.25;
    fight.hookTelegraph = Math.max(10, fight.hookTelegraph - 4);
    resetRoundHP();
    fight.roundOverlayT = 90;
    fight.roundOverlayText = "A última resistência";
  } else {
    if (!assist.infiniteLives) lives--;
    if (lives <= 0 && !assist.infiniteLives) {
      levelFinishing = true;
      fadeOut(() => { state = STATE.GAMEOVER; Sound.stopMusic(); Sound.gameover(); });
      return;
    }
    Sound.hurt();
    resetRoundHP();
    fight.roundOverlayT = 90;
    fight.roundOverlayText = "TENTE DE NOVO";
  }
}

function updateFight() {
  const f = fight;

  if (toastT > 0) { toastT--; if (toastT <= 0) toastMsg = null; }

  if (f.roundOverlayT > 0) { f.roundOverlayT--; return; }
  if (hitFreeze > 0) { hitFreeze--; return; } // congelamento curto de impacto (feedback de golpe forte)

  // --- Movimento do jogador (sem scroll; paredes do ringue em 40..W-40) ---
  // Núcleo único de movimento (ver stepPlayer): a arena troca sólidos pelo chão
  // do ringue e configura o dash como esquiva (recarga maior, i-frames,
  // bloqueada durante ataques). O processamento de ataques roda em seguida para
  // preservar a ordem original (dash usa o attackT do passo anterior).
  const step = stepPlayer({
    floorY: GROUND_Y,
    minX: 40,
    maxX: W - 40,
    dashCd: 45,
    dashInvuln: true,
    dashGate: true,
  });
  const wasPoundingFight = step.wasPounding;
  const previousFeet = step.prevFeet;
  // Soco rápido; chute de maior alcance/dano, com recuperação mais lenta.

  if (player.attackT > 0) {
    player.attackT--;
    const attack = ATTACKS[player.attackType];
    if (player.attackT === attack.impact) {
      const reach = attack.reach;
      const hitW = reach;
      const hitH = 28;
      const hx = player.facing === 1 ? player.x + player.w : player.x - reach;
      const hitbox = { x: hx, y: player.y + 10, w: reach, h: hitH };
      const bossBox = { x: f.boss.x, y: f.boss.y, w: f.boss.w, h: f.boss.h };
      if (aabb(hitbox, bossBox)) {
        const dmg = attack.damage * (f.boss.doubleDmg ? 2 : 1);
        f.bossHP -= dmg;
        f.boss.doubleDmg = false;
        f.boss.hitFlash = 10;
        if (player.attackType === "kick") { Sound.kick(); addShake(5); } else { Sound.punch(); addShake(4); }
        hitFreeze = 3;
        spawnParticles(hx + hitW / 2, player.y + 20, 6, "#ffd54d", { speed: 3, life: 12, r: 3 });
      }
    }
    if (player.attackT <= 0) player.attackType = null;
  }
  if (punchPressed && player.attackT === 0 && player.dashT === 0 && !player.pounding) {
    player.attackT = ATTACKS.punch.duration; player.attackType = "punch";
    Sound.punch();
    spawnParticles(player.x + player.w / 2 + player.facing * 20, player.y + player.h * 0.4, 4, "#ffffff", { speed: 2, life: 8, r: 2 });
  }
  if (kickPressed && player.attackT === 0 && player.dashT === 0 && !player.pounding) {
    player.attackT = ATTACKS.kick.duration; player.attackType = "kick";
    Sound.kick();
    spawnParticles(player.x + player.w / 2 + player.facing * 30, player.y + player.h * 0.5, 4, "#ffffff", { speed: 2, life: 8, r: 2 });
  }

  // --- Pouso do mergulho na arena (sem dano em área: a cabeça do boxeador tem
  // tratamento próprio lá embaixo) ---
  if (wasPoundingFight && player.onGround) {
    player.pounding = false;
    player.landingSquashT = 10;
    addShake(6);
    Sound.poundLand();
    spawnParticles(player.x + player.w / 2, player.y + player.h, 10, "#c9a35a", { speed: 4, life: 18, r: 3 });
  }

  if (player.invuln > 0) player.invuln--;
  updateParticles();

  // --- Ponto de troca do ringue ---
  const q = f.quindim;
  if (!aabb(player, q)) q.armed = true;
  if (aabb(player, q) && q.cd === 0 && q.armed !== false) {
    q.cd = 18;
    q.armed = false;
    setLeader(player.leader === "betinho" ? "quindim" : "betinho");
  }
  if (q.cd > 0) q.cd--;

  // --- Boxeador: máquina de estados ---
  const boss = f.boss;
  const dist = Math.abs((player.x + player.w / 2) - (boss.x + boss.w / 2));
  boss.stateT++;
  if (boss.hitFlash > 0) boss.hitFlash--;
  const bossSpeed = 1.6 * f.speedMul;

  switch (boss.state) {
    case "approach": {
      boss.dir = Math.sign(player.x - boss.x) || boss.dir;
      if (dist > 86) {
        boss.x += boss.dir * bossSpeed;
        boss.x = Math.max(40, Math.min(boss.x, W - 40 - boss.w));
      } else {
        boss.stateT = 0;
        const roll = Math.random();
        boss.dir = Math.sign(player.x - boss.x) || boss.dir;
        if (roll < 0.4) boss.state = "jab";
        else if (roll < 0.7) boss.state = "hook";
        else { boss.state = "charge"; boss.chargeDir = boss.dir; }
      }
      break;
    }
    case "jab": {
      if (boss.stateT <= 6) boss.glove = boss.stateT / 6;
      else boss.glove = Math.max(0, 1 - (boss.stateT - 6) / 12);
      if (boss.stateT === 6) {
        const gloveBox = { x: boss.dir >= 0 ? boss.x + boss.w : boss.x - 34, y: boss.y + 26, w: 34, h: 22 };
        if (aabb(player, gloveBox) && player.invuln === 0) {
          f.playerHP--; player.invuln = 40; Sound.punch(); addShake(4);
        }
      }
      if (boss.stateT >= 18) { boss.state = "approach"; boss.stateT = 0; boss.glove = 0; }
      break;
    }
    case "hook": {
      const T = f.hookTelegraph;
      if (boss.stateT < T) {
        boss.glove = 0.3 + 0.2 * Math.sin(boss.stateT * 0.8); // telegrafado, "piscando"
      } else if (boss.stateT === T) {
        boss.glove = 1;
        const gloveBox = { x: boss.dir >= 0 ? boss.x + boss.w : boss.x - 46, y: boss.y + 14, w: 46, h: 34 };
        if (aabb(player, gloveBox) && player.invuln === 0) {
          f.playerHP -= 2; player.invuln = 50; Sound.punch(); addShake(7);
          boss.state = "approach"; boss.stateT = 0; boss.glove = 0;
        } else {
          boss.state = "stun"; boss.stateT = 0; boss.glove = 0; // errou o hook
        }
      }
      break;
    }
    case "charge": {
      if (boss.stateT <= 24) break; // sinaliza a investida antes de avançar
      const spd = 6.5 * f.speedMul;
      boss.x += boss.chargeDir * spd;
      const hitbox = { x: boss.x, y: boss.y, w: boss.w, h: 60 }; // só a parte de cima; Quindim passa por baixo
      if (aabb(player, hitbox) && player.invuln === 0) {
        f.playerHP -= 2; player.invuln = 50; Sound.punch(); addShake(7);
        boss.state = "approach"; boss.stateT = 0;
      }
      if (boss.x <= 40 || boss.x >= W - 40 - boss.w) {
        boss.x = Math.max(40, Math.min(boss.x, W - 40 - boss.w));
        boss.state = "stun"; boss.stateT = 0; boss.doubleDmg = true; Sound.hurt();
        addShake(10); hitFreeze = 6;
      }
      break;
    }
    case "stun": {
      if (boss.stateT >= 90) { boss.state = "approach"; boss.stateT = 0; boss.doubleDmg = false; }
      break;
    }
  }

  // --- Jogador pisa na cabeça do boxeador (funciona em qualquer estado) ---
  if (boss.stompCooldown > 0) boss.stompCooldown--;
  const bossBox = { x: boss.x, y: boss.y, w: boss.w, h: boss.h };
  if (boss.stompCooldown === 0 && player.vy > 0 &&
      player.x < boss.x + boss.w && player.x + player.w > boss.x &&
      previousFeet <= boss.y + 8 && player.y + player.h >= boss.y) {
    const dmg = (wasPoundingFight ? 2 : 1) * (boss.doubleDmg ? 2 : 1);
    player.y = boss.y - player.h;
    player.pounding = false;
    f.bossHP -= dmg;
    boss.doubleDmg = false;
    player.vy = -9;
    boss.stompCooldown = 30; // evita o mesmo pulo acertar várias vezes seguidas no quique
    Sound.stomp();
    boss.hitFlash = 10;
    boss.state = "stun"; boss.stateT = 0;
    addShake(dmg > 1 ? 10 : 6); hitFreeze = dmg > 1 ? 6 : 4;
  }

  f.timer--;
  if (f.bossHP <= 0) { endRound(true); return; }
  if (f.playerHP <= 0) { endRound(false); return; }
  if (f.timer <= 0) { endRound(f.playerHP >= f.bossHP); return; }
}

/* ============================================================
   DESENHO
   ============================================================ */
function sceneryPalette() {
  if (bonusActive) return { sky: ["#111c2e", "#26334a"], far: "#1d3541", near: "#172c32", ground: "#3a3848", grass: "#7f9a78", brick: "#5a6571" };
  if (levelIndex < 4) return { sky: ["#5c9cac", "#f5d69c"], far: "#729394", near: "#426d69", ground: "#72534b", grass: "#a6bb79", brick: "#81998b" };
  if (levelIndex < 8) return { sky: ["#665273", "#efb07e"], far: "#887581", near: "#475b68", ground: "#67505b", grass: "#d1a66f", brick: "#9c807b" };
  if (levelIndex < 14) return { sky: ["#132e43", "#4f7381"], far: "#355565", near: "#203f4a", ground: "#374c53", grass: "#75a896", brick: "#5f7f83" };
  return { sky: ["#1b2947", "#b68486"], far: "#635f79", near: "#344654", ground: "#4e505c", grass: "#d2b07d", brick: "#7d8791" };
}
function drawBackground(lv) {
  const theme = sceneryPalette();
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, theme.sky[0]); g.addColorStop(1, theme.sky[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const night = bonusActive || levelIndex >= 8;
  ctx.fillStyle = night ? "#f7e3b2" : "#ffe6aa";
  ctx.beginPath(); ctx.arc(760 - cameraX * .035, 134, night ? 29 : 48, 0, Math.PI * 2); ctx.fill();
  if (night) {
    ctx.fillStyle = "#e6ead5";
    for (let i = 0; i < 35; i++) { const x = (i * 137 + 43) % W; const y = 76 + (i * 71) % 165; ctx.fillRect(x, y, i % 3 === 0 ? 2 : 1, 2); }
  } else {
    ctx.fillStyle = "rgba(255,243,222,0.28)";
    for (let i = -1; i < 3; i++) drawCloud(i * 490 - (cameraX * .13) % 490 + 90, 160 + (i % 2) * 38);
  }
  for (const [speed, color, height] of [[.18,theme.far,185],[.36,theme.near,100]]) {
    ctx.fillStyle = color;
    const offset = (cameraX * speed) % 480;
    for (let i = -1; i < 4; i++) {
      const x = i * 480 - offset;
      ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(x, 480);
      ctx.bezierCurveTo(x+90,480-height,x+250,480-height,x+480,480); ctx.lineTo(x+480,H); ctx.fill();
    }
  }
  // Silhuetas ao fundo dão profundidade sem esconder as superfícies de jogo.
  ctx.fillStyle = night ? "#193b43" : "#335e5b";
  for (let i = -1; i < 9; i++) {
    const x = i * 170 - (cameraX * .5) % 170;
    const top = 285 + ((i + 10) % 3) * 29;
    ctx.fillRect(x - 4, top, 8, 215);
    for (let j = 0; j < 3; j++) {
      ctx.beginPath(); ctx.moveTo(x,top-45+j*35); ctx.lineTo(x-36-j*7,top+40+j*35); ctx.lineTo(x+36+j*7,top+40+j*35); ctx.fill();
    }
  }
  if (levelIndex >= 14) for (let i = 0; i < 5; i++) drawHome(100+i*230-cameraX*.12,340+(i%2)*20,.55);
  if (night) {
    ctx.fillStyle = "#e9d999";
    for (let i = 0; i < 16; i++) { const x = ((i*193-cameraX*.6)%W+W)%W; const y=310+(i*37)%120; ctx.fillRect(x,y,3,3); }
  }
}

function drawCloud(x, y) {
  ctx.beginPath();
  ctx.arc(x, y, 26, 0, Math.PI * 2);
  ctx.arc(x + 30, y + 8, 32, 0, Math.PI * 2);
  ctx.arc(x + 66, y, 26, 0, Math.PI * 2);
  ctx.arc(x + 33, y - 14, 24, 0, Math.PI * 2);
  ctx.fill();
}

function drawSolids(lv) {
  const theme = sceneryPalette();
  for (const s of lv.solids) {
    const isGround = s.h >= 40;
    if (isGround) {
      // chão: terra + topo de grama
      ctx.fillStyle = theme.ground;
      ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.fillStyle = theme.grass;
      ctx.fillRect(s.x, s.y, s.w, 12);
      // tijolinhos de terra
      ctx.strokeStyle = "rgba(0,0,0,0.18)";
      ctx.lineWidth = 2;
      for (let bx = s.x; bx < s.x + s.w; bx += 40) {
        ctx.strokeRect(bx, s.y + 12, 40, s.h - 12);
      }
    } else {
      // plataforma de tijolo estilo Mario
      ctx.fillStyle = theme.brick;
      ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.fillStyle = "#d2c8a4";
      ctx.fillRect(s.x, s.y, s.w, 6);
      ctx.strokeStyle = "rgba(60,20,0,0.55)";
      ctx.lineWidth = 2;
      for (let bx = s.x; bx < s.x + s.w; bx += 30) {
        ctx.strokeRect(bx, s.y, 30, s.h);
      }
    }
  }
}

function drawGoal(lv) {
  if (!Number.isFinite(lv.goalX)) return;
  const gx = lv.goalX;
  // mastro
  ctx.fillStyle = "#dddddd";
  ctx.fillRect(gx, 220, 8, GROUND_Y - 220);
  ctx.fillStyle = "#f7d51d";
  ctx.beginPath();
  ctx.arc(gx + 4, 216, 10, 0, Math.PI * 2);
  ctx.fill();
  // bandeira
  ctx.fillStyle = "#e23b3b";
  ctx.beginPath();
  ctx.moveTo(gx + 8, 230);
  ctx.lineTo(gx + 70, 250);
  ctx.lineTo(gx + 8, 270);
  ctx.closePath();
  ctx.fill();
}

function drawMovers() {
  for (const m of movers) {
    ctx.fillStyle = "#8a6bd1";
    ctx.fillRect(m.x, m.y, m.w, m.h);
    ctx.fillStyle = "#b79bf0";
    ctx.fillRect(m.x, m.y, m.w, 5);
    ctx.strokeStyle = "rgba(40,20,70,0.55)";
    ctx.lineWidth = 2;
    for (let bx = m.x; bx < m.x + m.w; bx += 30) {
      ctx.strokeRect(bx, m.y, 30, m.h);
    }
  }
}

function drawCoin(cx, cy, r, wob) {
  const rx = Math.abs(Math.cos(wob)) * r + 2;
  ctx.save();
  ctx.fillStyle = "#f7d51d";
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff2a8";
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 0.5, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCoins() {
  for (const c of coins) {
    if (c.got) continue;
    c.wob += 0.08;
    drawCoin(c.x + c.w / 2, c.y + c.h / 2, c.h / 2, c.wob);
  }
}

function drawExchangePoints() {
  for (const point of exchangePoints) {
    point.wob += 0.08;
    const bob = Math.sin(point.wob) * 3;
    ctx.save();
    ctx.globalAlpha = point.cooldown > 0 ? 0.45 : 1;
    ctx.strokeStyle = "#f4bc69";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(point.x + point.w / 2, point.y + point.h / 2 + bob, 20, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#f4bc69";
    ctx.fillRect(point.x + 7, point.y + 4 + bob, 18, 5);
    ctx.fillRect(point.x + 7, point.y + 23 + bob, 18, 5);
    ctx.fillRect(point.x + 4, point.y + 7 + bob, 5, 18);
    ctx.fillRect(point.x + 23, point.y + 7 + bob, 5, 18);
    ctx.fillStyle = "#fff3d6";
    ctx.font = "bold 11px 'Trebuchet MS', sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.fillText("TROCA", point.x + point.w / 2, point.y - 7 + bob);
    ctx.restore();
  }
  drawCompanion();
}

function drawExchangePoint(point) {
  if (!point) return;
  const bob = Math.sin(point.wob || 0) * 3;
  ctx.save();
  ctx.globalAlpha = point.cd > 0 || point.cooldown > 0 ? 0.45 : 1;
  ctx.strokeStyle = "#f4bc69"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(point.x + point.w / 2, point.y + point.h / 2 + bob, 20, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = "#f4bc69"; ctx.fillRect(point.x + 6, point.y + point.h / 2 - 2 + bob, point.w - 12, 5);
  ctx.fillStyle = "#fff3d6"; ctx.font = "bold 10px 'Trebuchet MS', sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
  ctx.fillText("TROCA", point.x + point.w / 2, point.y - 6 + bob);
  ctx.restore();
}

function drawCompanion() {
  if (!companion || !FORM[companion.form]) return;
  const f = FORM[companion.form];
  const spr = f.frente;
  const dh = companion.h + f.scaleFrente;
  const dw = dh * (spr.sw / spr.sh);
  const cx = companion.x + companion.w / 2;
  const feetY = companion.y + companion.h;
  ctx.save();
  ctx.globalAlpha = 0.86;
  ctx.translate(cx, feetY);
  ctx.scale(companion.facing === -1 ? -1 : 1, 1);
  ctx.drawImage(spr.img, spr.sx, spr.sy, spr.sw, spr.sh, -dw / 2, -dh, dw, dh);
  ctx.restore();
}

function drawStarItem(x, y, w, h, wob) {
  const bob = Math.sin(wob) * 4;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2 + bob);
  ctx.rotate(wob * 0.5);
  ctx.fillStyle = "#ffe14d";
  drawStar(0, 0, w / 2);
  ctx.restore();
}
function drawStars() {
  for (const s of stars) {
    if (s.got) continue;
    s.wob += 0.06;
    drawStarItem(s.x, s.y, s.w, s.h, s.wob);
  }
}

function drawBoostItem(x, y, w, h, wob) {
  const bob = Math.sin(wob) * 4;
  const yy = y + bob;
  ctx.fillStyle = "#4fd1ff";
  ctx.beginPath();
  ctx.moveTo(x + w * 0.6, yy);
  ctx.lineTo(x + w * 0.15, yy + h * 0.55);
  ctx.lineTo(x + w * 0.45, yy + h * 0.55);
  ctx.lineTo(x + w * 0.3, yy + h);
  ctx.lineTo(x + w * 0.85, yy + h * 0.4);
  ctx.lineTo(x + w * 0.55, yy + h * 0.4);
  ctx.closePath();
  ctx.fill();
}
function drawBoosts() {
  for (const b of boosts) {
    if (b.got) continue;
    b.wob += 0.08;
    drawBoostItem(b.x, b.y, b.w, b.h, b.wob);
  }
}

function drawFeatherItem(x, y, w, h, wob) {
  const bob = Math.sin(wob) * 4;
  const yy = y + bob;
  ctx.save();
  ctx.translate(x + w / 2, yy + h / 2);
  ctx.rotate(-0.3);
  ctx.fillStyle = "#fff6e0";
  ctx.beginPath();
  ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#e0c98a";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, -h / 2); ctx.lineTo(0, h / 2); ctx.stroke();
  ctx.restore();
}
function drawFeathers() {
  for (const f of feathers) {
    if (f.got) continue;
    f.wob += 0.08;
    drawFeatherItem(f.x, f.y, f.w, f.h, f.wob);
  }
}

function drawTunnels(lv) {
  for (const t of (lv.tunnels || [])) {
    const bx = t.x, by = t.y;
    // corpo do cano
    ctx.fillStyle = "#2e9e4f";
    ctx.fillRect(bx, by - PIPE_H, PIPE_W, PIPE_H);
    ctx.fillStyle = "#1b6b34";
    ctx.fillRect(bx, by - PIPE_H, 6, PIPE_H);
    ctx.fillRect(bx + PIPE_W - 6, by - PIPE_H, 6, PIPE_H);
    // boca (mais larga e clara no topo)
    const mouthW = PIPE_W + 16;
    const mx = bx - 8;
    ctx.fillStyle = "#37b85e";
    ctx.fillRect(mx, by - PIPE_H - 14, mouthW, 18);
    ctx.fillStyle = "#1b6b34";
    ctx.fillRect(mx, by - PIPE_H - 14, mouthW, 5);
    // sombra interna
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(bx + 6, by - PIPE_H - 8, PIPE_W - 12, 10);

    // seta piscando indicando entrada (só quem tem saída definida)
    if (t.exit != null && Math.floor(performance.now() / 300) % 2 === 0) {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      const ax = bx + PIPE_W / 2, ay = by - PIPE_H - 30;
      ctx.moveTo(ax - 8, ay);
      ctx.lineTo(ax + 8, ay);
      ctx.lineTo(ax, ay + 12);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawCheckpoints() {
  for (const cp of checkpoints) {
    const x = cp.x;
    // mastro
    ctx.fillStyle = "#b8b8b8";
    ctx.fillRect(x - 2, 360, 5, GROUND_Y - 360);
    // galhardete: cinza quando inativo, verde quando ativado
    ctx.fillStyle = cp.on ? "#37d36a" : "#9a9a9a";
    ctx.beginPath();
    ctx.moveTo(x + 3, 366);
    ctx.lineTo(x + 40, 378);
    ctx.lineTo(x + 3, 390);
    ctx.closePath();
    ctx.fill();
  }
}

function drawInterludeClues() {
  if (!bonusActive || !interlude) return;
  interlude.clues.forEach((clue, index) => {
    if (clue.found) return;
    const active = index === interlude.clueIndex;
    const pulse = 1 + Math.sin(performance.now() / 180) * 0.08;
    ctx.save();
    ctx.globalAlpha = active ? 1 : 0.34;
    ctx.translate(clue.x + clue.w / 2, clue.y + clue.h / 2);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = active ? "#f4bc69" : "#8ca7b2";
    if (clue.kind === "pegada") {
      ctx.beginPath(); ctx.ellipse(0, 4, 11, 8, 0, 0, Math.PI * 2); ctx.fill();
      for (const dx of [-10, -3, 4, 11]) { ctx.beginPath(); ctx.arc(dx, -7, 3, 0, Math.PI * 2); ctx.fill(); }
    } else if (clue.kind === "tufo") {
      ctx.beginPath(); ctx.moveTo(-12, 9); ctx.lineTo(-5, -9); ctx.lineTo(0, 5); ctx.lineTo(7, -12); ctx.lineTo(12, 9); ctx.closePath(); ctx.fill();
    } else {
      ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 3;
      for (const r of [7, 14, 21]) { ctx.beginPath(); ctx.arc(-2, 0, r, -0.8, 0.8); ctx.stroke(); }
    }
    ctx.restore();
    // O HUD já exibe a contagem; o ícone ativo fica limpo para não competir
    // com os telegráficos dos inimigos próximos.
  });
}

function drawEnemy(en) {
  const cx = en.x + en.w / 2;
  const bottom = en.y + en.h;
  if (en.type === "sentinela") {
    const open = en.state === "open";
    ctx.save();
    ctx.fillStyle = open ? "#7aa69a" : "#39485d";
    ctx.fillRect(en.x + 6, en.y + 12, en.w - 12, en.h - 12);
    ctx.fillStyle = "#233042";
    ctx.beginPath(); ctx.moveTo(cx, en.y - 9); ctx.lineTo(cx + 14, en.y + 9); ctx.lineTo(cx - 14, en.y + 9); ctx.closePath(); ctx.fill();
    ctx.fillStyle = open ? "#ffd178" : "#657a8b";
    ctx.fillRect(en.x - 8, en.y + 17, en.w + 16, 14);
    ctx.fillStyle = "#dce7d8";
    ctx.fillRect(cx - 11, en.y + 20, 6, 5); ctx.fillRect(cx + 5, en.y + 20, 6, 5);
    ctx.fillStyle = open ? "#8ff0a4" : "#ff7d62";
    ctx.fillRect(cx - 8, en.y + 21, 3, 3); ctx.fillRect(cx + 5, en.y + 21, 3, 3);
    ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.font = "bold 11px 'Trebuchet MS', sans-serif";
    ctx.fillStyle = open ? "#d5ffe1" : "#ffd1a8";
    ctx.fillText(open ? "ABERTO" : en.state === "windup" ? "AGORA" : "GUARDA", cx, en.y - 14);
    ctx.restore();
  } else if (en.type === "eco") {
    const charge = en.state === "charge";
    ctx.save();
    ctx.fillStyle = charge ? "#945a83" : "#4c3b61";
    ctx.beginPath(); ctx.arc(cx, en.y + 20, 19, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#f0c6ff"; ctx.fillRect(cx - 11, en.y + 15, 7, 5); ctx.fillRect(cx + 4, en.y + 15, 7, 5);
    ctx.fillStyle = "#ff856e"; ctx.fillRect(cx - 8, en.y + 16, 3, 3); ctx.fillRect(cx + 5, en.y + 16, 3, 3);
    ctx.strokeStyle = "#dca0e8"; ctx.lineWidth = 3;
    if (en.waveActive) {
      for (const r of [16, 29, 42]) { ctx.beginPath(); ctx.arc(cx, en.y + 21, r, -0.8, 0.8); ctx.stroke(); }
      ctx.fillStyle = "#f0d0ff"; ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.font = "bold 11px 'Trebuchet MS', sans-serif"; ctx.fillText("SALTE", cx, en.y - 12);
    }
    ctx.restore();
  } else if (en.type === "espreita") {
    const hidden = en.state === "hidden";
    const trembling = en.state === "tremble";
    ctx.save();
    ctx.fillStyle = hidden || trembling ? "#294a3f" : "#6c3f64";
    ctx.fillRect(en.x + 8, en.y + 15, en.w - 16, en.h - 15);
    ctx.fillStyle = "#477456";
    const shake = trembling ? Math.sin(en.stateT * 1.4) * 3 : 0;
    for (const dx of [-18, -7, 8, 19]) {
      ctx.beginPath(); ctx.ellipse(cx + dx + shake, en.y + 17, 10, 5, dx * 0.03, 0, Math.PI * 2); ctx.fill();
    }
    if (!hidden) {
      ctx.fillStyle = "#ff8b87"; ctx.fillRect(cx - 10, en.y + 17, 6, 5); ctx.fillRect(cx + 4, en.y + 17, 6, 5);
      ctx.fillStyle = "#e4ffd7"; ctx.fillRect(cx - 8, en.y + 18, 2, 2); ctx.fillRect(cx + 5, en.y + 18, 2, 2);
    }
    if (trembling) { ctx.fillStyle = "#b7e89b"; ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.font = "bold 10px 'Trebuchet MS', sans-serif"; ctx.fillText("...", cx, en.y - 10); }
    if (en.state === "exposed") { ctx.fillStyle = "#d7ffc7"; ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.font = "bold 10px 'Trebuchet MS', sans-serif"; ctx.fillText("ABERTO", cx, en.y - 10); }
    ctx.restore();
  } else if (en.type === "patrol") {
    // "Goomba": cogumelo marrom
    ctx.fillStyle = "#7a4a1e";
    ctx.beginPath();
    ctx.ellipse(cx, en.y + 14, en.w / 2, 15, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(en.x + 4, en.y + 14, en.w - 8, en.h - 20);
    // pés que balançam
    ctx.fillStyle = "#3d2410";
    const f = Math.sin(en.wob) * 3;
    ctx.fillRect(en.x + 5, bottom - 6, 12, 6);
    ctx.fillRect(en.x + en.w - 17, bottom - 6 + f, 12, 6);
    // olhos
    ctx.fillStyle = "#fff";
    ctx.fillRect(cx - 9, en.y + 12, 7, 9);
    ctx.fillRect(cx + 2, en.y + 12, 7, 9);
    ctx.fillStyle = "#000";
    ctx.fillRect(cx - 7 + en.dir * 2, en.y + 15, 3, 5);
    ctx.fillRect(cx + 4 + en.dir * 2, en.y + 15, 3, 5);
  } else if (en.type === "flyer") {
    // "Abelha" voadora: corpo listrado + asas batendo
    const flap = Math.sin(en.wob * 2) * 8;
    ctx.fillStyle = "#f2c94c";
    ctx.beginPath();
    ctx.ellipse(cx, en.y + en.h / 2, en.w / 2 - 3, en.h / 2 - 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#3d2b0a";
    ctx.lineWidth = 3;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + i * 7, en.y + 6);
      ctx.lineTo(cx + i * 7, en.y + en.h - 6);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.beginPath(); ctx.ellipse(cx - 10, en.y + en.h / 2 - 8 + flap * 0.3, 12, 6, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 10, en.y + en.h / 2 - 8 - flap * 0.3, 12, 6, 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#000";
    ctx.beginPath(); ctx.arc(cx - 5, en.y + en.h / 2, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 5, en.y + en.h / 2, 2.5, 0, Math.PI * 2); ctx.fill();
  } else if (en.type === "miniboss") {
    // Mini-chefe: espinhoso roxo, maior, com pips de vida acima da cabeça
    const flashing = en.hitFlash > 0 && Math.floor(en.hitFlash / 2) % 2 === 0;
    if (!flashing) {
      const bob = Math.sin(en.wob) * 3;
      ctx.fillStyle = "#5b2a86";
      ctx.beginPath();
      ctx.ellipse(cx, en.y + en.h / 2 + bob, en.w / 2 - 2, en.h / 2 - 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3a1a5c";
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
        const sx = cx + Math.cos(a) * (en.w / 2 - 2);
        const sy = en.y + en.h / 2 + bob + Math.sin(a) * (en.h / 2 - 2);
        ctx.beginPath();
        ctx.arc(sx, sy, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#fff";
      ctx.fillRect(cx - 14, en.y + 16 + bob, 10, 10);
      ctx.fillRect(cx + 4, en.y + 16 + bob, 10, 10);
      ctx.fillStyle = "#e23b3b";
      ctx.fillRect(cx - 11 + en.dir * 3, en.y + 19 + bob, 4, 4);
      ctx.fillRect(cx + 7 + en.dir * 3, en.y + 19 + bob, 4, 4);
    }
    for (let i = 0; i < en.maxHp; i++) {
      ctx.fillStyle = i < en.hp ? "#ffd54d" : "rgba(255,255,255,0.3)";
      ctx.beginPath();
      ctx.arc(cx - (en.maxHp - 1) * 7 + i * 14, en.y - 12, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // "Chaser": bicho espinhoso vermelho (perseguidor)
    const bob = Math.sin(en.wob) * 2;
    ctx.fillStyle = "#c62828";
    ctx.beginPath();
    ctx.arc(cx, en.y + en.h / 2 + bob, en.w / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
    // espinhos
    ctx.fillStyle = "#8e1616";
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
      const sx = cx + Math.cos(a) * (en.w / 2 - 2);
      const sy = en.y + en.h / 2 + bob + Math.sin(a) * (en.h / 2 - 2);
      ctx.beginPath();
      ctx.arc(sx, sy, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // olhos bravos
    ctx.fillStyle = "#fff";
    ctx.fillRect(cx - 8, en.y + 12 + bob, 6, 6);
    ctx.fillRect(cx + 2, en.y + 12 + bob, 6, 6);
    ctx.fillStyle = "#000";
    ctx.fillRect(cx - 7 + en.dir * 2, en.y + 14 + bob, 3, 3);
    ctx.fillRect(cx + 3 + en.dir * 2, en.y + 14 + bob, 3, 3);
  }
}

function drawPlayer() {
  // pisca quando invulnerável (menos durante a transição de túnel)
  if (player.invuln > 0 && !tunnelAnim && Math.floor(player.invuln / 5) % 2 === 0) return;

  const f = FORM[player.form];
  const walking = player.moving && player.onGround && !tunnelAnim;
  const runFrame = Math.floor(player.walkPhase / 1.8) % f.correr.length;
  const spr = walking ? f.correr[runFrame] : f.frente;
  let dw, dh;
  if (walking) {
    // corpo comprido de dachshund: mais largo que a caixa
    dh = player.h + f.scaleCorrer;
    dw = dh * (spr.sw / spr.sh);
  } else {
    dh = player.h + f.scaleFrente;
    dw = dh * (spr.sw / spr.sh);
  }
  const cx = player.x + player.w / 2;
  const feetY = player.y + player.h; // base (contato com o chão), em espaço de mundo

  // Brilho da estrela (invencibilidade temporária)
  if (player.starT > 0) {
    const hue = (performance.now() / 4) % 360;
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.15 * Math.sin(performance.now() / 60);
    ctx.fillStyle = `hsl(${hue}, 90%, 60%)`;
    ctx.beginPath();
    ctx.arc(cx, feetY - dh / 2, dh * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Rastro de super velocidade
  if (player.speedBoostT > 0 && player.moving) {
    for (let i = 1; i <= 2; i++) {
      ctx.save();
      ctx.globalAlpha = 0.15 * (3 - i);
      ctx.translate(cx - player.facing * i * 14, feetY);
      const flipS = (walking && player.facing === 1);
      ctx.scale(flipS ? -1 : 1, 1);
      ctx.drawImage(spr.img, spr.sx, spr.sy, spr.sw, spr.sh, -dw / 2, -dh, dw, dh);
      ctx.restore();
    }
  }

  // Asinhas quando tem a Pena (visível principalmente planando no ar)
  if (player.hasFeather && !player.onGround) {
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "#fff6e0";
    ctx.beginPath(); ctx.ellipse(cx - dw * 0.3, feetY - dh * 0.6, 14, 7, 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + dw * 0.3, feetY - dh * 0.6, 14, 7, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Rastro de movimento durante o dash: cópias translúcidas atrás do corpo
  if (player.dashT > 0) {
    for (let i = 1; i <= 3; i++) {
      ctx.save();
      ctx.globalAlpha = 0.12 * (4 - i);
      ctx.translate(cx - player.dashDir * i * 10, feetY);
      const flipT = (walking && player.facing === 1);
      ctx.scale(flipT ? -1 : 1, 1);
      ctx.drawImage(spr.img, spr.sx, spr.sy, spr.sw, spr.sh, -dw / 2, -dh, dw, dh);
      ctx.restore();
    }
  }

  // Achatamento: pouso forte (ground pound) alarga e encurta; mergulho no ar afina e alonga
  let squashX = 1, squashY = 1;
  if (player.landingSquashT > 0) {
    const t = player.landingSquashT / 10;
    squashX = 1 + 0.35 * t;
    squashY = 1 - 0.3 * t;
  } else if (player.pounding) {
    squashX = 0.85;
    squashY = 1.15;
  }

  ctx.save();
  // Origem na base do sprite: escala vertical encolhe/cresce a partir dos pés
  // (usado na animação de entrar/sair do túnel e no achatamento de impacto).
  const flip = (walking && player.facing === 1);
  ctx.translate(cx, feetY);
  const lean = player.dashT > 0 ? player.dashDir * 0.12 : 0; // leve inclinação durante o dash
  ctx.rotate(lean);
  ctx.scale((flip ? -1 : 1) * squashX, playerVisualScaleY * squashY);

  const bob = walking ? -Math.abs(Math.sin(player.walkPhase)) * 2 : 0;
  ctx.drawImage(spr.img, spr.sx, spr.sy, spr.sw, spr.sh, -dw / 2, -dh + bob, dw, dh);
  ctx.restore();

  if (player.landingSquashT > 0) player.landingSquashT--;
}

/* Visual do jogador na arena de luta (idle/ataque/especial) — mesma física do stomp, só troca a arte. */
function drawFightPlayer() {
  if (player.invuln > 0 && Math.floor(player.invuln / 5) % 2 === 0) return;

  const f = FORM[player.form];
  let poseName;
  if (player.attackType === "punch") poseName = "ataque";
  else if (player.attackType === "kick") poseName = "especial";
  else if (player.dashT > 0) poseName = "especial";
  else if (player.pounding) poseName = "ataque";
  else poseName = "idle";
  const inAir = !player.onGround && !player.pounding && player.attackT === 0;
  const spr = inAir ? f.frente : f.luta[poseName];
  const scaleRef = inAir ? f.scaleFrente : f.scaleLuta;
  const dh = player.h + scaleRef;
  const dw = dh * (spr.sw / spr.sh);
  const cx = player.x + player.w / 2;
  const feetY = player.y + player.h;

  let squashX = 1, squashY = 1;
  if (player.landingSquashT > 0) {
    const t = player.landingSquashT / 10;
    squashX = 1 + 0.35 * t;
    squashY = 1 - 0.3 * t;
  } else if (player.pounding) {
    squashX = 0.85;
    squashY = 1.15;
  }

  // Attack lunge: slight forward offset during active frames
  let lungeX = 0;
  if (player.attackT > 0) {
    const progress = 1 - player.attackT / 15;
    const lunge = progress < 0.4 ? progress / 0.4 : 1 - (progress - 0.4) / 0.6;
    lungeX = player.facing * lunge * 8;
    squashX = 1 + lunge * 0.1;
  }

  // Dash afterimages in fight
  if (player.dashT > 0) {
    for (let i = 1; i <= 2; i++) {
      ctx.save();
      ctx.globalAlpha = 0.12 * (3 - i);
      const flipT = player.facing === -1;
      ctx.translate(cx - player.dashDir * i * 10, feetY);
      ctx.scale((flipT ? -1 : 1), 1);
      ctx.drawImage(spr.img, spr.sx, spr.sy, spr.sw, spr.sh, -dw / 2, -dh, dw, dh);
      ctx.restore();
    }
  }

  ctx.save();
  const flip = player.facing === -1;
  ctx.translate(cx + lungeX, feetY);
  ctx.scale((flip ? -1 : 1) * squashX, squashY);
  ctx.drawImage(spr.img, spr.sx, spr.sy, spr.sw, spr.sh, -dw / 2, -dh, dw, dh);
  ctx.restore();

  if (player.landingSquashT > 0) player.landingSquashT--;
}

function drawHUD() {
  ctx.save();
  ctx.fillStyle = "rgba(13,32,44,0.94)"; ctx.fillRect(0,0,W,74);
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  ctx.fillStyle = "#f4bc69"; ctx.font = "12px 'Trebuchet MS', sans-serif";
  ctx.fillText(campaignLabel(), 20, 10);
  ctx.fillStyle = "#fff3d6"; ctx.font = "bold 19px 'Trebuchet MS', sans-serif";
  ctx.fillText(bonusActive ? "O rastro de Quindim" : JOURNEY[levelIndex][0], 20, 30);
  drawCoin(355,29,9,0); ctx.fillStyle = "#fff3d6"; ctx.fillText(String(coinsTotal),374,20);
  ctx.font = "13px 'Trebuchet MS', sans-serif";
  const status = [];
  if (player.starT > 0) status.push("Estrela " + Math.ceil(player.starT/60) + "s");
  if (player.speedBoostT > 0) status.push("Velocidade " + Math.ceil(player.speedBoostT/60) + "s");
  if (player.hasFeather) status.push("Pena");
  ctx.fillStyle = "#c4dad9"; ctx.fillText(status.join(" · "),435,17);
  ctx.fillStyle = player.dashCooldown > 0 ? "#8ca7b2" : "#f4bc69";
  ctx.fillText(player.dashCooldown > 0 ? "Dash recarregando" : "Dash pronto",435,39);
  if (bonusActive && interlude) {
    ctx.fillStyle = "#c4dad9";
    ctx.fillText(`Pistas ${interlude.clueIndex} / 3`, 435, 57);
  } else {
    ctx.fillStyle = "#c4dad9";
    ctx.fillText(player.leader === "quindim" ? "Líder: Quindim" : "Líder: Betinho", 435, 57);
  }
  drawHeart(766,18); ctx.fillStyle = "#fff3d6"; ctx.font = "bold 19px 'Trebuchet MS', sans-serif";
  ctx.fillText(assist.infiniteLives ? "∞" : String(lives),785,20);
  ctx.fillStyle = "#c4dad9"; ctx.font = "13px 'Trebuchet MS', sans-serif"; ctx.fillText("P / Esc  Pausa",846,26);
  const goal = currentLevel().goalX;
  const progress = Number.isFinite(goal) ? Math.max(0,Math.min(1,player.x/goal)) : (interlude ? interlude.clueIndex / 3 : 0);
  ctx.fillStyle = "#f4bc69"; ctx.fillRect(0,71,W*progress,3);
  ctx.restore(); drawToast();
}

function drawToast() {
  if (!toastMsg) return;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 34px 'Trebuchet MS', sans-serif";
  ctx.globalAlpha = toastT < 30 ? toastT / 30 : 1;
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(0,0,0,0.8)";
  ctx.strokeText(toastMsg, W / 2, 90);
  ctx.fillStyle = "#ffe14d";
  ctx.fillText(toastMsg, W / 2, 90);
  ctx.restore();
}

function drawHeart(x, y) {
  ctx.fillStyle = "#ff4d6d";
  ctx.beginPath();
  ctx.moveTo(x, y + 4);
  ctx.bezierCurveTo(x, y, x - 10, y, x - 10, y + 6);
  ctx.bezierCurveTo(x - 10, y + 12, x, y + 16, x, y + 20);
  ctx.bezierCurveTo(x, y + 16, x + 10, y + 12, x + 10, y + 6);
  ctx.bezierCurveTo(x + 10, y, x, y, x, y + 4);
  ctx.fill();
}

/* Pausa compartilhada por teclado, controle e botões da interface. */
function pauseAction(index) {
  if (state !== STATE.PAUSED) return;
  if (pauseConfirm) {
    if (!pauseAccept) { pauseConfirm = null; return; }
    const action = pauseConfirm;
    pauseConfirm = null;
    // Descarta uma transição pendente antes de reiniciar ou sair.
    fade.dir = 0; fade.alpha = 0; fade.callback = null;
    if (action === "restart") bonusActive ? startInterlude({ replay: true }) : startGame(levelIndex);
    else returnToTitle();
    return;
  }
  if (index === 0) togglePause();
  else if (index === 1 || index === 5) {
    pauseConfirm = index === 1 ? "restart" : "title";
    pauseAccept = false;
  } else if (index === 2) { Sound.muted = !Sound.muted; saveMuted(); }
  else if (index === 3) { assist.infiniteLives = !assist.infiniteLives; saveAssist(); }
  else if (index === 4) { assist.noFallDeath = !assist.noFallDeath; saveAssist(); }
}
function updatePause() {
  if (menuUpPressed || menuDownPressed) {
    if (pauseConfirm) pauseAccept = !pauseAccept;
    else pauseFocus = (pauseFocus + (menuUpPressed ? 5 : 1)) % 6;
    Sound.blip(440, 0.04);
  }
  if (confirmPressed || anyKey) pauseAction(pauseFocus);
}
function moveGuide() {
  return modeInfo().isArena ? [
    ["Pular", "↑ / Espaço · A · toque A", "Pule a investida e reposicione-se."],
    ["Soco", "Z · B · toque B", "Rápido e curto: 1 de dano."],
    ["Chute", "Y · botão Y · toque Y", "Mais alcance: 2 de dano, recuperação lenta."],
    ["Esquiva", "X / Shift · botão X · toque X", "Cruze o ataque. Recarga de 0,75 s."],
    ["Mergulho", "↓ no ar · direcional ↓ · toque ▼", "Acerte por cima: 2 de dano."],
  ] : [
    ["Pulo duplo", "↑ / Espaço · A/B · toque A", "Solte e aperte novamente no ar."],
    ["Dash", "X / Shift · X · toque X", "Ganhe distância e atravesse inimigos."],
    ["Mergulho", "↓ no ar · direcional ↓ · toque ▼", "O impacto atinge os inimigos ao redor."],
    ["Planar", "Segure pular com a pena · segure A", "Desça devagar para escolher onde pousar."],
    ["Pontos de troca", "Toque no marco dourado", "Alterne o líder quando o caminho pedir outro tamanho."],
  ];
}
function journeyPanel(title, lines, y = 82) {
  ctx.save();
  ctx.fillStyle = "rgba(14,32,45,0.94)";
  ctx.fillRect(42, y, 876, 132);
  ctx.fillStyle = "#f4bc69"; ctx.fillRect(42, y, 5, 132);
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  ctx.font = "bold 25px 'Trebuchet MS', sans-serif";
  ctx.fillText(title, 65, y + 17);
  ctx.fillStyle = "#f1eee0"; ctx.font = "17px 'Trebuchet MS', sans-serif";
  lines.forEach((line, i) => ctx.fillText(line, 65, y + 56 + i * 27));
  ctx.restore();
}
function drawChapterIntro() {
  // Cartões antigos eram temporizados. A renderização agora acontece em
  // STATE.NARRATIVE, para que nenhuma informação desapareça enquanto a
  // família ainda está lendo.
}

function narrativeCopy() {
  if (narrative && narrative.kind === "interlude") {
    return ["O rastro de Quindim", "Quindim sumiu na entrada do bosque. Betinho vai seguir três pistas, uma por vez.", "Enter / Espaço / A / B para continuar"];
  }
  const entry = JOURNEY[narrative ? narrative.stageIndex : levelIndex] || JOURNEY[0];
  return [entry[0], entry[1], entry[2]];
}

function wrapCanvasText(text, x, y, maxWidth, lineHeight) {
  const words = text.split(/\s+/);
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      ctx.fillText(line, x, y); y += lineHeight; line = word;
    } else line = candidate;
  }
  if (line) ctx.fillText(line, x, y);
  return y + lineHeight;
}

function wrapCanvasTextCentered(text, centerX, y, maxWidth, lineHeight) {
  const words = text.split(/\s+/);
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      ctx.fillText(line, centerX, y); y += lineHeight; line = word;
    } else line = candidate;
  }
  if (line) ctx.fillText(line, centerX, y);
  return y + lineHeight;
}

function drawNarrativeCard() {
  drawWorld();
  const [title, story, tip] = narrativeCopy();
  ctx.save();
  ctx.fillStyle = "rgba(8,20,29,0.86)"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#f4bc69"; ctx.fillRect(52, 82, 6, 286);
  ctx.strokeStyle = "#f4bc6955"; ctx.lineWidth = 2; ctx.strokeRect(52, 82, 856, 286);
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  ctx.fillStyle = "#8fb7ae"; ctx.font = "bold 13px 'Trebuchet MS', sans-serif";
  ctx.fillText(narrative.kind === "interlude" ? "INTERLÚDIO" : `ETAPA ${narrative.stageIndex + 1} / 16`, 82, 112);
  ctx.fillStyle = "#fff3d6"; ctx.font = "bold 36px 'Trebuchet MS', sans-serif";
  ctx.fillText(title, 82, 142);
  ctx.fillStyle = "#e3e9dc"; ctx.font = "20px 'Trebuchet MS', sans-serif";
  wrapCanvasText(story, 82, 214, 760, 30);
  ctx.fillStyle = "#f4bc69"; ctx.font = "bold 16px 'Trebuchet MS', sans-serif";
  wrapCanvasText(tip, 82, 292, 760, 24);
  ctx.fillStyle = narrative.guard > 0 ? "#8ca7b2" : "#fff3d6";
  ctx.font = "14px 'Trebuchet MS', sans-serif"; ctx.textAlign = "right";
  ctx.fillText(narrative.guard > 0 ? "Leia com calma…" : "Enter / Espaço / A / B · continuar", 874, 338);
  ctx.restore();
}

function updateNarrative() {
  if (!narrative) return;
  if (narrative.guard > 0) narrative.guard--;
  if (narrative.guard > 0 || (!confirmPressed && !anyKey)) return;
  const kind = narrative.kind;
  narrative = null;
  if (kind === "interlude") {
    state = STATE.INTERLUDE;
    Sound.startMusic(INTERLUDE_MUSIC.melody, INTERLUDE_MUSIC.bass, INTERLUDE_MUSIC.stepSec);
  } else {
    state = STATE.PLAYING;
    Sound.startMusic();
  }
}

function drawCutscene() {
  drawWorld();
  ctx.save();
  ctx.fillStyle = "rgba(7,13,23,0.79)"; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  const kind = scene && scene.kind;
  let title = ""; let text = "";
  if (kind === "separation") {
    title = "O rastro se separa";
    text = "Uma silhueta atravessa a trilha. Quindim desaparece entre as raízes; Betinho fica com o medo e um caminho para seguir.";
  } else if (kind === "reunion") {
    title = "O rastro termina";
    text = "Atrás da árvore caída, Betinho encontra Quindim. O Lobo recua — por enquanto, a coragem ocupa o caminho.";
  } else {
    title = "A luz atravessa o medo";
    text = "O Lobo das Sombras se dissolve na claridade. Ele nunca foi dono da estrada: era o medo de atravessá-la.";
  }
  ctx.fillStyle = "#f4bc69"; ctx.font = "bold 38px 'Trebuchet MS', sans-serif";
  const bodyY = wrapCanvasTextCentered(title, W / 2, 144, 820, 42) + 8;
  ctx.fillStyle = "#fff3d6"; ctx.font = "20px 'Trebuchet MS', sans-serif";
  ctx.textAlign = "left";
  wrapCanvasText(text, 150, Math.max(214, bodyY), 660, 30);
  ctx.textAlign = "center";
  if (kind === "separation") {
    ctx.fillStyle = "#0a0c16"; ctx.beginPath(); ctx.ellipse(708, 350, 92, 46, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(630, 352); ctx.lineTo(650, 267); ctx.lineTo(680, 330); ctx.lineTo(716, 250); ctx.lineTo(760, 337); ctx.lineTo(790, 270); ctx.lineTo(816, 354); ctx.closePath(); ctx.fill();
  } else if (kind === "reunion") {
    ctx.strokeStyle = "#f4bc69"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(W / 2, 350, 76, 0, Math.PI * 2); ctx.stroke();
    drawCompanion();
  } else {
    ctx.globalAlpha = 0.42 + Math.sin(performance.now() / 300) * 0.15;
    ctx.fillStyle = "#2a2147"; ctx.beginPath(); ctx.ellipse(750, 347, 88, 44, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1; ctx.fillStyle = scene && scene.guard > 0 ? "#8ca7b2" : "#fff3d6";
  ctx.font = "14px 'Trebuchet MS', sans-serif"; ctx.fillText(scene && scene.guard > 0 ? "A imagem fica aqui enquanto você lê…" : "Enter / Espaço / A / B · continuar", W / 2, 438);
  ctx.restore();
}

function updateScene() {
  if (!scene) return;
  if (scene.guard > 0) scene.guard--;
  if (scene.guard > 0 || (!confirmPressed && !anyKey)) return;
  const kind = scene.kind;
  scene = null;
  if (kind === "separation") startInterlude();
  else if (kind === "reunion") beginStage(CAMPAIGN_FLOW.resumeAt, true);
  else { state = STATE.VICTORY; victoryScenePending = false; Sound.victory(); }
}
function drawTitle() {
  ctx.save();
  const shade = ctx.createLinearGradient(0, 0, W, 0);
  shade.addColorStop(0, "rgba(12,29,40,0.97)"); shade.addColorStop(1, "rgba(12,29,40,0.3)");
  ctx.fillStyle = shade; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  ctx.fillStyle = "#f4bc69"; ctx.font = "bold 72px 'Trebuchet MS', sans-serif";
  ctx.fillText("Betinho", 66, 76);
  ctx.fillStyle = "#fff3d6"; ctx.font = "bold 35px 'Trebuchet MS', sans-serif";
  ctx.fillText("O caminho de casa", 68, 157);
  ctx.fillStyle = "#c5d8d9"; ctx.font = "21px 'Trebuchet MS', sans-serif";
  ctx.fillText("Um portão aberto. Dois amigos longe de casa.", 69, 227);
  ctx.fillText("Uma última luz do outro lado do bosque.", 69, 258);
  ctx.fillStyle = titleFocus === 0 ? "#f4bc69" : "#385669"; ctx.fillRect(68, 336, 385, 53);
  ctx.fillStyle = "#172d3b"; ctx.font = "bold 21px 'Trebuchet MS', sans-serif";
  ctx.fillText("Nova viagem", 88, 352);
  if (replayInterludeUnlocked) {
    ctx.fillStyle = titleFocus === 1 ? "#f4bc69" : "#385669"; ctx.fillRect(68, 400, 385, 44);
    ctx.fillStyle = "#172d3b"; ctx.font = "bold 17px 'Trebuchet MS', sans-serif";
    ctx.fillText("Rejogar O rastro de Quindim", 88, 414);
  }
  ctx.fillStyle = "#c5d8d9"; ctx.font = "16px 'Trebuchet MS', sans-serif";
  ctx.fillText("↑ ↓ escolher · Enter / A confirmar · O: assistência", 69, 470);
  ctx.fillText(LEVELS.length + " Etapas · Interlúdio entre " + (CAMPAIGN_FLOW.interludeAfter + 1) + " e " + (CAMPAIGN_FLOW.resumeAt + 1) + " · recorde na Etapa " + Math.min(LEVELS.length, bestLevel), 69, 496);
  const b = SPR.frente, q = SPR.qFrente;
  if (b.img.complete && b.img.naturalWidth) ctx.drawImage(b.img,b.sx,b.sy,b.sw,b.sh,650,196,134,178);
  if (q.img.complete && q.img.naturalWidth) ctx.drawImage(q.img,q.sx,q.sy,q.sw,q.sh,782,260,95,127);
  ctx.restore();
}

function updateTitle() {
  const max = replayInterludeUnlocked ? 2 : 1;
  if (menuUpPressed) { titleFocus = (titleFocus + max - 1) % max; Sound.blip(440, 0.05); }
  if (menuDownPressed) { titleFocus = (titleFocus + 1) % max; Sound.blip(440, 0.05); }
  if (!(anyKey || confirmPressed)) return;
  if (titleFocus === 1 && replayInterludeUnlocked) startInterlude({ replay: true });
  else beginCampaign();
}
function drawEnding() {
  ctx.save();
  ctx.fillStyle = "#152e40"; ctx.fillRect(0,0,W,H);
  ctx.fillStyle = "#f4bc69"; ctx.beginPath(); ctx.arc(760,120,48,0,Math.PI*2); ctx.fill();
  // O Lobo não é derrotado como um animal: perde forma quando a luz ocupa a tela.
  const dissolve = 0.18 + 0.12 * Math.sin(performance.now() / 240);
  ctx.globalAlpha = dissolve;
  ctx.fillStyle = "#2a2147"; ctx.beginPath(); ctx.ellipse(760,328,92,45,0,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(680,330); ctx.lineTo(700,245); ctx.lineTo(730,302); ctx.lineTo(765,230); ctx.lineTo(812,315); ctx.lineTo(840,250); ctx.lineTo(865,334); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
  drawHome(615, 245, 1.4);
  const b = SPR.frente, q = SPR.qFrente;
  if (b.img.complete && b.img.naturalWidth) ctx.drawImage(b.img,b.sx,b.sy,b.sw,b.sh,510,327,82,108);
  if (q.img.complete && q.img.naturalWidth) ctx.drawImage(q.img,q.sx,q.sy,q.sw,q.sh,580,357,57,77);
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  ctx.fillStyle = "#fff3d6"; ctx.font = "bold 48px 'Trebuchet MS', sans-serif";
  ctx.fillText(victoryScenePending ? "A luz atravessa o medo." : "A luz era de casa.", 62, 112);
  ctx.font = "22px 'Trebuchet MS', sans-serif"; ctx.fillStyle = "#c5d8d9";
  ctx.fillText(victoryScenePending ? "O Lobo das Sombras perde forma diante da claridade." : "O portão se abriu. Os dois chegaram juntos.", 64, 186);
  ctx.fillText(victoryScenePending ? "Ele era o medo de atravessar, não o dono da estrada." : "O Lobo se dissolveu na luz: era o medo do caminho.", 64, 221);
  ctx.fillStyle = "#f4bc69"; ctx.font = "bold 20px 'Trebuchet MS', sans-serif";
  ctx.fillText(victoryScenePending ? "Enter / A para ver o final" : "Enter / A para uma nova viagem", 64, 335);
  ctx.font = "17px 'Trebuchet MS', sans-serif"; ctx.fillStyle = "#c5d8d9";
  ctx.fillText(coinsTotal + " moedas pelo caminho", 64, 375);
  ctx.restore();
}
function drawHome(x, y, scale) {
  ctx.save(); ctx.translate(x,y); ctx.scale(scale,scale);
  ctx.fillStyle = "#4a626c"; ctx.fillRect(0,30,110,90);
  ctx.fillStyle = "#be7969"; ctx.beginPath(); ctx.moveTo(-12,32); ctx.lineTo(55,-10); ctx.lineTo(122,32); ctx.fill();
  ctx.fillStyle = "#ffd489"; ctx.fillRect(16,49,24,28); ctx.fillRect(68,49,24,28);
  ctx.fillStyle = "#183442"; ctx.fillRect(46,81,22,39);
  ctx.restore();
}


/* --------- Telas de sobreposição --------- */
function overlay(title, subtitle, color) {
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  // encolhe a fonte do título se não couber na largura da tela
  let size = 64;
  ctx.font = "bold " + size + "px 'Trebuchet MS', sans-serif";
  const maxW = W - 60;
  while (size > 28 && ctx.measureText(title).width > maxW) {
    size -= 4;
    ctx.font = "bold " + size + "px 'Trebuchet MS', sans-serif";
  }
  ctx.fillText(title, W / 2, H / 2 - 40);
  ctx.fillStyle = "#fff";
  ctx.font = "24px 'Trebuchet MS', sans-serif";
  ctx.fillText(subtitle, W / 2, H / 2 + 30);
}

/* --------- Tela de Opções (modo assistência) --------- */
function drawOptions() {
  drawWorld();
  ctx.fillStyle = "rgba(0,0,0,0.72)";
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffe14d";
  ctx.font = "bold 42px 'Trebuchet MS', sans-serif";
  ctx.fillText("OPÇÕES", W / 2, H / 2 - 130);

  const items = [
    "Vidas infinitas: " + (assist.infiniteLives ? "LIGADO" : "desligado"),
    "Sem morte por queda: " + (assist.noFallDeath ? "LIGADO" : "desligado"),
    "Voltar",
  ];
  ctx.font = "bold 26px 'Trebuchet MS', sans-serif";
  items.forEach((label, i) => {
    const y = H / 2 - 30 + i * 54;
    ctx.fillStyle = i === optionsFocus ? "#ffe14d" : "#fff";
    ctx.fillText((i === optionsFocus ? "> " : "") + label + (i === optionsFocus ? " <" : ""), W / 2, y);
  });

  ctx.fillStyle = "#cfd8e6";
  ctx.font = "16px 'Trebuchet MS', sans-serif";
  ctx.fillText("Setas ↑/↓: navegar  •  Enter/Espaço: mudar  •  Esc ou O: voltar", W / 2, H / 2 + 150);
}

function updateOptions() {
  if (menuUpPressed) { optionsFocus = (optionsFocus + 2) % 3; Sound.blip(440, 0.05); }
  if (menuDownPressed) { optionsFocus = (optionsFocus + 1) % 3; Sound.blip(440, 0.05); }
  if (confirmPressed || anyKey) {
    if (optionsFocus === 0) { assist.infiniteLives = !assist.infiniteLives; saveAssist(); Sound.blip(assist.infiniteLives ? 700 : 350, 0.08); }
    else if (optionsFocus === 1) { assist.noFallDeath = !assist.noFallDeath; saveAssist(); Sound.blip(assist.noFallDeath ? 700 : 350, 0.08); }
    else { state = STATE.TITLE; Sound.blip(400, 0.06); }
  }
}

/* --------- Desenho da fase de luta --------- */
function drawBoxer(boss) {
  if (boss.hitFlash > 0 && Math.floor(boss.hitFlash / 2) % 2 === 0) return;
  ctx.save();
  const cx = boss.x + boss.w/2;
  ctx.fillStyle = boss.state === "stun" ? "#81999e" : "#484360";
  ctx.fillRect(boss.x+7,boss.y+30,boss.w-14,boss.h-30);
  ctx.beginPath(); ctx.ellipse(cx,boss.y+22,25,26,0,0,Math.PI*2); ctx.fill();
  for (const side of [-1,1]) {
    ctx.beginPath(); ctx.moveTo(cx+side*23,boss.y+10); ctx.lineTo(cx+side*22,boss.y-13); ctx.lineTo(cx+side*5,boss.y+5); ctx.fill();
  }
  ctx.fillStyle = "#aea4b9"; ctx.beginPath(); ctx.ellipse(cx+boss.dir*15,boss.y+31,19,12,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = "#17293d"; ctx.beginPath(); ctx.arc(cx+boss.dir*29,boss.y+27,5,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = "#ffcc7d"; ctx.fillRect(cx+boss.dir*8-3,boss.y+13,6,4);
  ctx.fillStyle = boss.state === "hook" ? "#f4bc69" : "#77718e";
  ctx.beginPath(); ctx.arc(cx+boss.dir*(27+(boss.glove||0)*40),boss.y+49,13,0,Math.PI*2);ctx.fill();
  ctx.beginPath(); ctx.arc(cx-boss.dir*23,boss.y+55,11,0,Math.PI*2);ctx.fill();
  // Intenção legível antes dos golpes, com oportunidade clara de resposta.
  if (boss.state === "hook" || boss.state === "stun" || (boss.state === "charge" && boss.stateT <= 24)) {
    ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.font = "bold 13px 'Trebuchet MS', sans-serif";
    ctx.fillStyle = boss.state === "stun" ? "#bfe8d1" : "#ffe0a1";
    ctx.fillText(boss.state === "stun" ? "Ataque agora!" : "Esquive!",cx,boss.y-20);
  }
  ctx.restore();
}

function drawHPBar(x, y, w, h, hp, max, color, label, align) {
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
  ctx.fillStyle = "#222";
  ctx.fillRect(x, y, w, h);
  const pct = Math.max(0, hp) / max;
  ctx.fillStyle = color;
  if (align === "right") ctx.fillRect(x + w * (1 - pct), y, w * pct, h);
  else ctx.fillRect(x, y, w * pct, h);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 13px 'Trebuchet MS', sans-serif";
  ctx.textAlign = align === "right" ? "right" : "left";
  ctx.textBaseline = "bottom";
  ctx.fillText(label, align === "right" ? x + w : x, y - 4);
}

function drawStar(cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + i * (2 * Math.PI / 5);
    const a2 = a + Math.PI / 5;
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.lineTo(cx + Math.cos(a2) * r * 0.5, cy + Math.sin(a2) * r * 0.5);
  }
  ctx.closePath();
  ctx.fill();
}

function drawFightHUD(f) {
  drawHPBar(20, 30, 300, 22, f.playerHP, FIGHT_MAX_HP, "#37d36a", "VOCÊ", "left");
  drawHPBar(W - 320, 30, 300, 22, f.bossHP, FIGHT_MAX_HP, "#e23b3b", f.bossName, "right");
  ctx.fillStyle = "#fff";
  ctx.font = "bold 26px 'Trebuchet MS', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(String(Math.max(0, Math.ceil(f.timer / 60))), W / 2, 14);
  for (let i = 0; i < 2; i++) {
    ctx.fillStyle = i < f.wins ? "#ffe14d" : "rgba(255,255,255,0.25)";
    drawStar(40 + i * 26, 65, 8);
  }
  drawToast();
}

function drawFight() {
  const f = fight;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#1a1435");
  g.addColorStop(1, "#3d2b56");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const sp = ctx.createRadialGradient(W / 2, 0, 20, W / 2, 0, 420);
  sp.addColorStop(0, "rgba(255,255,255,0.25)");
  sp.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sp;
  ctx.fillRect(0, 0, W, 300);

  // tremor de tela nos golpes fortes: sacode o ringue, não o HUD
  const shakeMag = screenShake;
  const shakeX = shakeMag ? (Math.random() - 0.5) * 2 * shakeMag : 0;
  const shakeY = shakeMag ? (Math.random() - 0.5) * 2 * shakeMag : 0;
  screenShake *= 0.85;
  if (screenShake < 0.4) screenShake = 0;
  ctx.save();
  ctx.translate(shakeX, shakeY);

  drawHome(680, 215, 1.5);
  ctx.fillStyle = "#283448"; ctx.fillRect(38,180,36,320); ctx.fillRect(W-74,180,36,320);
  ctx.strokeStyle = "#59647a"; ctx.lineWidth = 7;
  for (let x=96; x<W-74; x+=42) { ctx.beginPath();ctx.moveTo(x,220);ctx.lineTo(x,500);ctx.stroke(); }
  ctx.lineWidth = 10; ctx.beginPath();ctx.moveTo(74,270);ctx.lineTo(W-74,270);ctx.stroke();
  ctx.fillStyle = "#56616b";ctx.fillRect(0,GROUND_Y,W,H-GROUND_Y);
  ctx.fillStyle = "#edc893";ctx.fillRect(0,GROUND_Y,W,5);

  f.quindim.wob = performance.now() / 200;
  drawExchangePoint(f.quindim);

  drawBoxer(f.boss);
  drawFightPlayer();
  drawParticles();
  ctx.restore();

  drawFightHUD(f);
  ctx.fillStyle = "rgba(12,29,42,0.9)"; ctx.fillRect(150, H-31, 660, 26);
  ctx.textAlign = "center"; ctx.font = "13px 'Trebuchet MS', sans-serif"; ctx.fillStyle = "#fff3d6";
  ctx.fillText("Z / B: soco   ·   Y: chute   ·   X / Shift: esquiva   ·   ↓: mergulho   ·   P: guia", W/2, H-24);

  if (f.roundOverlayT > 0) {
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffe14d";
    ctx.font = "bold 42px 'Trebuchet MS', sans-serif";
    ctx.fillText(f.roundOverlayText, W / 2, H / 2 - 25);
    ctx.font = "20px 'Trebuchet MS', sans-serif"; ctx.fillStyle = "#fff3d6";
    ctx.fillText("Esquive. Espere a abertura. Abra o caminho de casa.", W / 2, H / 2 + 38);
  }
}

function drawWorld() {
  // Desenho por registro de modos (auditoria M4): plataforma e interlúdio
  // compartilham o mundo; a arena desenha o ringue.
  MODES[chapterMode()].draw();
}

function drawStageWorld() {
  const lv = currentLevel();
  drawBackground(lv);

  // tremor de tela nos impactos (pisão, pouso de ground pound)
  const shakeMag = screenShake;
  const shakeX = shakeMag ? (Math.random() - 0.5) * 2 * shakeMag : 0;
  const shakeY = shakeMag ? (Math.random() - 0.5) * 2 * shakeMag : 0;
  screenShake *= 0.85;
  if (screenShake < 0.4) screenShake = 0;

  ctx.save();
  ctx.translate(shakeX - cameraX, shakeY);
  drawSolids(lv);
  drawTunnels(lv);
  drawMovers();
  drawCheckpoints();
  drawInterludeClues();
  drawGoal(lv);
  for (const en of enemies) drawEnemy(en);
  drawCoins();
  drawExchangePoints();
  drawStars();
  drawBoosts();
  drawFeathers();
  drawPlayer();
  drawParticles();
  ctx.restore();
  drawHUD();
  drawChapterIntro();
}

function render() {
  if (typeof syncGameUI === "function") syncGameUI();
  switch (state) {
    case STATE.LOADING:
      ctx.fillStyle = "#6fb7ff";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#fff";
      ctx.font = "24px 'Trebuchet MS', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Carregando o Betinho...", W / 2, H / 2);
      break;

    case STATE.TITLE:
      drawWorld();
      drawTitle();
      break;

    case STATE.OPTIONS:
      drawOptions();
      break;

    case STATE.NARRATIVE:
      drawNarrativeCard();
      break;

    case STATE.CUTSCENE:
      drawCutscene();
      break;

    case STATE.INTERLUDE:
      drawWorld();
      break;

    case STATE.PLAYING:
      drawWorld();
      break;

    case STATE.PAUSED:
      drawWorld();
      ctx.fillStyle = "rgba(12,24,36,0.65)";
      ctx.fillRect(0, 0, W, H);
      break;

    case STATE.GAMEOVER:
      drawWorld();
      overlay("TENTE DE NOVO", bonusActive ? "Enter / A: refazer O rastro de Quindim" : "Enter / A: reiniciar a etapa " + (levelIndex + 1) + " com 3 vidas", "#ff5b5b");
      break;

    case STATE.FIGHT_WON:
      drawWorld();
      overlay("O CAMINHO ESTÁ LIVRE", "Enter / A para continuar", "#ffe14d");
      break;

    case STATE.VICTORY:
      drawWorld();
      drawEnding();
      break;
  }
  drawFade();
  drawPadDebug();
}

/* Painel de diagnóstico do controle (tecla G) */
function drawPadDebug() {
  if (!padDebug) return;
  const lines = ["[G] DIAGNOSTICO DO CONTROLE"];
  if (padInfo) {
    lines.push("id: " + padInfo.id);
    lines.push("mapping: " + padInfo.mapping + "    index: " + padInfo.index);
    lines.push("axes: [" + padInfo.axes.join(", ") + "]");
    lines.push("botoes: " + (padInfo.pressed.length ? padInfo.pressed.join(", ") : "nenhum"));
    lines.push("-> andar: esq=" + pad.left + "  dir=" + pad.right);
    lines.push("Aperte o botao de PULAR e veja qual numero acende.");
  } else {
    lines.push("NENHUM controle detectado.");
    lines.push("1) Abra no Google Chrome (Safari falha).");
    lines.push("2) Clique no jogo, depois aperte um botao do controle.");
    lines.push("3) Conecte por cabo USB-C ou dongle 2.4GHz.");
    lines.push("4) No G7 Pro, tente o modo Xbox/X-input na chave.");
  }
  ctx.font = "14px monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const x0 = 10, y0 = 52, lh = 20;
  const boxH = lines.length * lh + 14;
  ctx.fillStyle = "rgba(0,0,0,0.8)";
  ctx.fillRect(x0, y0, W - 20, boxH);
  ctx.strokeStyle = "#37d36a";
  ctx.lineWidth = 2;
  ctx.strokeRect(x0, y0, W - 20, boxH);
  ctx.fillStyle = "#8ff0a4";
  lines.forEach((t, i) => ctx.fillText(t, x0 + 10, y0 + 8 + i * lh));
}

/* ============================================================
   LOOP PRINCIPAL (passo fixo + render)
   ============================================================ */
let last = performance.now();
let acc = 0;
const STEP = 1000 / 60;

function frame(now) {
  if (!inputActive) {
    last = now;
    acc = 0;
    requestAnimationFrame(frame);
    return;
  }
  try {
    let dt = now - last;
    last = now;
    if (dt > 250) dt = 250; // evita "salto" ao voltar de aba inativa
    acc += dt;

    while (acc >= STEP) {
      pollGamepad();
      if (state !== STATE.PAUSED && state !== STATE.NARRATIVE && state !== STATE.CUTSCENE) updateFade();
      if (state === STATE.PLAYING) {
        updatePlaying();
      } else if (state === STATE.PAUSED) {
        updatePause();
      } else if (state === STATE.OPTIONS) {
        updateOptions();
      } else if (state === STATE.TITLE) {
        updateTitle();
      } else if (state === STATE.NARRATIVE) {
        updateNarrative();
      } else if (state === STATE.CUTSCENE) {
        updateScene();
      } else if (state === STATE.INTERLUDE) {
        updateInterlude();
      } else if (state === STATE.GAMEOVER || state === STATE.VICTORY) {
        if (anyKey || confirmPressed) {
          if (state === STATE.GAMEOVER && bonusActive) {
            startInterlude({ replay: true });
          } else if (state === STATE.GAMEOVER) {
            const restartLevel = levelIndex;
            fadeOut(() => { startGame(restartLevel); });
          } else if (state === STATE.VICTORY && victoryScenePending) {
            victoryScenePending = false;
          } else {
            fadeOut(() => { beginCampaign(); });
          }
        }
      } else if (state === STATE.FIGHT_WON) {
        if (anyKey) {
          const next = levelIndex + 1;
          fadeOut(() => { beginStage(next, true); });
        }
      }
      // STATE.PAUSED: não atualiza física nem reinicia; só o toggle (P/Start) mexe no estado.
      anyKey = false;
      jumpPressed = false;
      downPressed = false;
      dashPressed = false;
      punchPressed = false;
      kickPressed = false;
      menuUpPressed = false;
      menuDownPressed = false;
      confirmPressed = false;
      acc -= STEP;
    }
    render();
  } catch (err) {
    // nunca deixa uma exceção travar o loop principal (tela congelada pra sempre)
    console.error("Erro no loop do jogo:", err);
    acc = 0;
  }
  requestAnimationFrame(frame);
}

/* Espera todas as imagens dos sprites (frente/correr/luta, Betinho + Quindim) carregarem antes de liberar o título */
const SPR_IMAGES = Object.values(SPR).flatMap((entry) => {
  if (entry.img) return [entry.img];
  if (Array.isArray(entry)) return entry.map((f) => f.img);
  return Object.values(entry).map((f) => f.img);
});
let loaded = 0;
function onImgLoad() {
  loaded++;
  if (loaded >= SPR_IMAGES.length) {
    loadLevel(0);      // prepara cenário de fundo para a tela de título
    state = STATE.TITLE;

    // atalho de teste: ?fase=N (1-based) ou ?fase=bonus abre um capítulo direto
    const params = new URLSearchParams(location.search);
    const faseParam = params.get("fase");
    if (faseParam === "bonus") {
      lives = 3; coinsTotal = 0; coinsForLife = 0;
      startInterlude({ replay: true });
      return;
    }
    const fase = parseInt(faseParam, 10);
    if (fase >= 1 && fase <= LEVELS.length) {
      lives = 3; coinsTotal = 0; coinsForLife = 0;
      beginStage(fase - 1, true);
    }
  }
}
for (const img of SPR_IMAGES) {
  img.onload = onImgLoad;
  if (img.complete) onImgLoad(); // fallback: já em cache
}

requestAnimationFrame(frame);
