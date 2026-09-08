const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// S2 (reset único do jogador) e S3 (semântica única de checkpoint).
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
    document: { hidden: false, getElementById: () => ({ width: 960, height: 540, getContext: () => ctx }), addEventListener() {}, querySelectorAll: () => [] },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8'), sandbox);
  const run = (code) => vm.runInContext(code, sandbox);
  run('Sound.ensure = () => {}; Sound.blip = () => {}; Sound.hurt = () => {}; Sound.checkpoint = () => {}; Sound.startMusic = () => {}; Sound.stopMusic = () => {}; render = () => {};');
  return { run };
}

test('resetPlayerTo devolve jogador + companheiro a um estado limpo', () => {
  const g = game();
  g.run('startGame(0);');
  g.run('setForm("quindim"); player.hasFeather = true; player.starT = 100; player.dashT = 5; player.attackT = 4; player.invuln = 20; companion.x = 4000;');
  g.run('resetPlayerTo(300, 454, { invuln: 40 });');
  assert.equal(g.run('player.form'), 'betinho');
  assert.equal(g.run('player.w'), g.run('FORM.betinho.w'));
  assert.equal(g.run('player.x'), 300);
  assert.equal(g.run('player.y'), 454);
  assert.equal(g.run('player.invuln'), 40);
  assert.equal(g.run('player.starT'), 0);
  assert.equal(g.run('player.hasFeather'), false);
  assert.equal(g.run('player.attackT'), 0);
  assert.equal(g.run('companion.x'), 254, 'companheiro reposiciona ao lado do jogador');
  assert.equal(g.run('companion.form'), 'quindim');
});

test('perder vida volta ao checkpoint mantendo moedas e checkpoint (tentativa)', () => {
  const g = game();
  g.run('startGame(0);');
  g.run('checkpoints[0].on = true; respawn = { x: 1279, y: 454 }; coinsTotal = 7; coinsForLife = 7; lives = 3;');
  g.run('player.x = 300; player.y = 800; loseLife();');
  assert.equal(g.run('player.x'), 1279, 'volta ao marco');
  assert.equal(g.run('lives'), 2);
  assert.equal(g.run('coinsTotal'), 7, 'moedas da tentativa ficam');
  assert.equal(g.run('checkpoints[0].on'), true, 'checkpoint da tentativa fica');
  assert.equal(g.run('player.invuln'), 100);
});

test('assistência contra queda teleporta sem perder vida e mantém a tentativa', () => {
  const g = game();
  g.run('startGame(0); assist.noFallDeath = true;');
  g.run('coinsTotal = 3; respawn = { x: 1279, y: 454 }; player.x = 900; player.y = 900; player.vy = 20; player.invuln = 0;');
  g.run('updatePlaying();'); // caiu no buraco com assist
  assert.equal(g.run('player.x'), 1279);
  assert.equal(g.run('lives'), 3, 'não perde vida');
  assert.equal(g.run('coinsTotal'), 3);
  assert.equal(g.run('player.invuln'), 60);
});

test('armCheckpoint redefine o marco uma única vez por checkpoint', () => {
  const g = game();
  g.run('startGame(0);');
  g.run('const cp = checkpoints[0]; armCheckpoint(cp);');
  assert.equal(g.run('checkpoints[0].on'), true);
  assert.equal(g.run('respawn.x'), g.run('checkpoints[0].x - PW / 2'));
  g.run('player.x = 2000; updatePlaying();'); // passou por cp sem chamar de novo
  assert.equal(g.run('checkpoints[0].on'), true);
});

test('pista do interlúdio vira marco de retorno silencioso', () => {
  const g = game();
  g.run('startInterlude({ replay: false }); state = STATE.INTERLUDE;');
  g.run('let chk = 0; Sound.checkpoint = () => { chk++; }; player.x = 520; player.y = 430; player.onGround = true; updateInterlude();');
  assert.equal(g.run('interlude.clueIndex'), 1, 'pegada encontrada');
  assert.equal(g.run('checkpoints[0].on'), true, 'checkpoint 1 armado');
  assert.equal(g.run('respawn.x'), g.run('checkpoints[0].x - PW / 2'));
  assert.equal(g.run('chk'), 0, 'sem som de checkpoint (a pista já toca o dela)');
});

test('round da arena: reset posiciona o jogador e preserva invulnerabilidade', () => {
  const g = game();
  g.run('startGame(15); fight.roundOverlayT = 0;');
  g.run('player.x = 500; player.invuln = 30; player.dashT = 8; player.attackT = 3; resetRoundHP();');
  assert.equal(g.run('player.x'), 120);
  assert.equal(g.run('player.dashT'), 0);
  assert.equal(g.run('player.attackT'), 0);
  assert.equal(g.run('player.invuln'), 30, 'round novo mantém i-frames pendentes (como antes)');
  assert.equal(g.run('fight.playerHP'), g.run('FIGHT_MAX_HP'));
});
