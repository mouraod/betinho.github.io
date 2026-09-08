const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Invariantes do passo de movimento UNIFICADO (stepPlayer), compartilhado por
// plataforma, interlúdio e arena. Protegem o refactor: se um ajuste de feel
// quebrar uma regra num modo, estes testes pegam em todos os modos que usam o
// passo compartilhado.
function game() {
  const listeners = {};
  const ctx = {};
  const sandbox = {
    console, URLSearchParams, performance: { now: () => 0 },
    Image: class { complete = false; },
    location: { search: '' }, navigator: {},
    localStorage: { getItem: () => null, setItem() {} },
    requestAnimationFrame() {}, setInterval: () => 1, clearInterval() {},
    window: { addEventListener: (name, fn) => { listeners[name] = fn; } },
    document: {
      hidden: false,
      getElementById: () => ({ width: 960, height: 540, getContext: () => ctx }),
      addEventListener() {},
      querySelectorAll: () => [],
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8'), sandbox);
  const run = (code) => vm.runInContext(code, sandbox);
  run('Sound.ensure = () => {}; Sound.blip = () => {}; Sound.startMusic = () => {}; render = () => {};');
  return { run };
}

test('pulo duplo consome uma única vez e o terceiro não existe no ar', () => {
  const g = game();
  g.run('startGame(0); player.x = 200; player.y = 454; player.onGround = true;');
  g.run('jumpPressed = true; updatePlaying();');
  for (let i = 0; i < 12; i++) g.run('jumpPressed = false; updatePlaying();');
  g.run('jumpPressed = true; updatePlaying();'); // 2º pulo
  assert.equal(g.run('player.jumps'), 2);
  for (let i = 0; i < 10; i++) g.run('updatePlaying();');
  g.run('jumpPressed = true; updatePlaying();'); // sem pulos restantes
  assert.equal(g.run('player.jumps'), 2, 'não pode haver terceiro pulo');
});

test('planar com a pena segura limita a queda a 1.5 px/passo', () => {
  const g = game();
  g.run('startGame(0); player.x = 900; player.y = 100; player.onGround = false; player.hasFeather = true; player.vy = 12; keys.jump = true;');
  for (let i = 0; i < 5; i++) g.run('updatePlaying();');
  assert.ok(g.run('player.vy') <= 1.5);
});

test('dash da arena tem recarga 45 e dá i-frames; o de plataforma 30 sem i-frames', () => {
  const g = game();
  g.run('startGame(15); fight.roundOverlayT = 0; player.x = 200; player.y = 454; player.onGround = true; dashPressed = true; updateFight();');
  assert.equal(g.run('player.dashCooldown'), 45);
  assert.ok(g.run('player.invuln') >= 8, 'esquiva deve conceder i-frames');
  const g2 = game();
  g2.run('startGame(0); player.x = 200; player.y = 454; player.onGround = true; dashPressed = true; updatePlaying();');
  assert.equal(g2.run('player.dashCooldown'), 30);
  assert.equal(g2.run('player.invuln'), 0, 'dash de plataforma não concede i-frames');
});

test('mergulho só atinge inimigos do mesmo andar (interlúdio usa o filtro sameFloor)', () => {
  const g = game();
  g.run('startInterlude({ replay: false }); state = STATE.INTERLUDE;');
  const land = () => { for (let i = 0; i < 60; i++) g.run('updateInterlude();'); };
  // Inimigo no chão (topo 462), jogador mergulha na plataforma de cima (390).
  g.run('enemies = [{ type: "patrol", x: 380, y: 462, w: 40, h: 38, dead: false, minX: 0, maxX: 4000, dir: 1 }];');
  g.run('player.x = 370; player.y = 300; player.onGround = false; player.pounding = true; player.vy = 20;');
  land();
  assert.equal(g.run('player.pounding'), false, 'mergulho deve aterrissar na plataforma');
  assert.equal(g.run('enemies.length'), 1, 'inimigo ~110px abaixo não pode morrer');
  // Controle: inimigo no mesmo andar da plataforma morre e é filtrado.
  g.run('enemies = [{ type: "patrol", x: 350, y: 364, w: 40, h: 38, dead: false, minX: 0, maxX: 4000, dir: 1 }];');
  g.run('player.x = 370; player.y = 300; player.onGround = false; player.pounding = true; player.vy = 20;');
  land();
  assert.equal(g.run('enemies.length'), 0, 'inimigo no mesmo andar morre e é filtrado');
});

test('interlúdio anima a passada e esmaga em pouso rápido (drifts unificados)', () => {
  const g = game();
  g.run('startInterlude({ replay: false }); state = STATE.INTERLUDE; keys.right = true;');
  g.run('updateInterlude(); updateInterlude();');
  assert.ok(g.run('player.walkPhase') > 0, 'andando no interlúdio deve animar as patinhas');
  g.run('keys.right = false; player.x = 90; player.y = 50; player.vy = 14; player.onGround = false;');
  for (let i = 0; i < 60; i++) g.run('updateInterlude();');
  assert.ok(g.run('player.landingSquashT') > 0, 'pouso rápido deve esmagar');
});
