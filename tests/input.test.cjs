const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function game() {
  const listeners = {};
  const documentListeners = {};
  const sandbox = {
    console, URLSearchParams, performance: { now: () => 0 },
    Image: class { complete = false; },
    location: { search: '' }, navigator: {},
    localStorage: { getItem: () => null, setItem() {} },
    requestAnimationFrame() {}, setInterval: () => 1, clearInterval() {},
    window: { addEventListener: (name, fn) => { listeners[name] = fn; } },
    document: {
      hidden: false,
      getElementById: () => ({ width: 960, height: 540, getContext: () => ({}) }),
      addEventListener: (name, fn) => { documentListeners[name] = fn; },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8'), sandbox);
  const run = code => vm.runInContext(code, sandbox);
  run('Sound.ensure = () => {}; Sound.blip = () => {}; state = STATE.PLAYING;');
  return {
    run,
    key(code, down = true, repeat = false) {
      listeners[down ? 'keydown' : 'keyup']({ code, repeat, preventDefault() {} });
    },
    blur() { listeners.blur?.(); },
    hide() { sandbox.document.hidden = true; documentListeners.visibilitychange?.(); },
  };
}

test('segurar pausa e mudo não alterna repetidamente', () => {
  const g = game();
  g.key('KeyP');
  g.key('KeyP', true, true);
  assert.equal(g.run('state'), g.run('STATE.PAUSED'));
  g.key('KeyM');
  g.key('KeyM', true, true);
  assert.equal(g.run('Sound.muted'), true);
});

test('soltar uma das teclas equivalentes mantém a outra pressionada', () => {
  const g = game();
  g.key('ArrowUp');
  g.key('Space');
  g.key('ArrowUp', false);
  assert.equal(g.run('keys.jump'), true);
  g.key('Space', false);
  assert.equal(g.run('keys.jump'), false);
  g.key('ShiftLeft');
  g.key('KeyX');
  g.key('KeyX', false);
  assert.equal(g.run('keys.dash'), true);
});

test('X continua sendo dash na plataforma e não dispara chute na arena', () => {
  const g = game();
  g.run('startGame(0);');
  g.key('KeyX');
  assert.equal(g.run('dashPressed'), true);
  g.key('KeyX', false);
  g.run('levelIndex = 15;');
  g.key('KeyX');
  assert.equal(g.run('kickPressed'), false);
  assert.equal(g.run('dashPressed'), true);
  g.key('KeyX', false);
  g.key('KeyY');
  assert.equal(g.run('kickPressed'), true);
});

for (const event of ['blur', 'hide']) {
  test(`${event}: pausa e limpa comandos pendentes sem retomar sozinho`, () => {
    const g = game();
    g.key('ArrowRight');
    g.key('Space');
    g[event]();
    assert.equal(g.run('state'), g.run('STATE.PAUSED'));
    assert.equal(g.run('keys.right || keys.jump || jumpPressed || confirmPressed'), false);
    g[event]();
    assert.equal(g.run('state'), g.run('STATE.PAUSED'));
  });
}

test('Game Over reinicia a fase atual com três vidas em todas as 16 fases', () => {
  const g = game();
  g.run('render = () => {};');
  const count = g.run('LEVELS.length');
  for (let i = 0; i < count; i++) {
    g.run(`levelIndex = ${i}; state = STATE.GAMEOVER; lives = 0; fade.active = false;`);
    g.key('Enter');
    g.run('frame(last + STEP + 1);');
    // Executa a transição real até carregar a fase.
    g.run('for (let n = 0; n < 100; n++) updateFade();');
    assert.equal(g.run('levelIndex'), i);
    assert.equal(g.run('lives'), 3);
    assert.equal(g.run('state'), g.run('STATE.PLAYING'));
    assert.equal(g.run('player.x'), g.run(`LEVELS[${i}].start.x`));
    assert.equal(g.run('checkpoints.some(cp => cp.on)'), false);
  }
});

test('janela inativa não avança transições nem consulta comandos do controle', () => {
  const g = game();
  g.blur();
  g.run('pollGamepad = () => { throw new Error("controle em segundo plano"); };');
  g.run('fadeOut(() => { state = STATE.PLAYING; });');
  g.run('frame(1000);');
  assert.equal(g.run('fade.alpha'), 0);
  assert.equal(g.run('state'), g.run('STATE.PAUSED'));
});

test('a jornada tem uma única luta final, com vitória encerrando o jogo', () => {
  const g = game();
  assert.equal(g.run('LEVELS.filter(l => l.type === "fight").length'), 1);
  assert.equal(g.run('LEVELS[6].type === "fight"'), false);
  g.run('startGame(15); fight.wins = 1; endRound(true);');
  assert.equal(g.run('state'), g.run('STATE.VICTORY'));
});

test('pausa congela transições e reinício exige confirmação, cancelável', () => {
  const g = game();
  g.run('startGame(6); render = () => {}; fadeOut(() => { levelIndex = 9; }); togglePause();');
  g.run('frame(200);');
  assert.equal(g.run('fade.alpha'), 0);
  g.run('pauseAction(1); pauseAction(1);');
  assert.equal(g.run('pauseConfirm'), null);
  assert.equal(g.run('levelIndex'), 6);
  g.run('pauseAction(1); pauseAccept = true; pauseAction(1); updateFade();');
  assert.equal(g.run('levelIndex'), 6);
  assert.equal(g.run('state'), g.run('STATE.PLAYING'));
  assert.equal(g.run('fade.callback'), null);
});

test('gamepad separa X/esquiva, B/soco e Y/chute na arena', () => {
  const g = game();
  g.run('startGame(15); navigator.getGamepads = () => [{axes: [], buttons: Array.from({length:16}, (_, i) => ({pressed: i === 1}))}]; pollGamepad();');
  assert.equal(g.run('punchPressed'), true);
  assert.equal(g.run('jumpPressed'), false);
  g.run('punchPressed = false; navigator.getGamepads = () => [{axes: [], buttons: Array.from({length:16}, (_, i) => ({pressed: i === 3}))}]; pollGamepad();');
  assert.equal(g.run('kickPressed'), true);
  g.run('kickPressed = false; navigator.getGamepads = () => [{axes: [], buttons: Array.from({length:16}, (_, i) => ({pressed: i === 2}))}]; pollGamepad();');
  assert.equal(g.run('dashPressed'), true);
});

test('gamepad X arma dash na plataforma sem gerar golpe de arena', () => {
  const g = game();
  g.run('startGame(0); navigator.getGamepads = () => [{axes: [], buttons: Array.from({length:16}, (_, i) => ({pressed: i === 2}))}]; pollGamepad();');
  assert.equal(g.run('dashPressed'), true);
  assert.equal(g.run('punchPressed'), false);
  assert.equal(g.run('kickPressed'), false);
});

for (const [key, expectedDamage, duration] of [['KeyZ',1,12],['KeyY',2,28]]) {
  test(`${key}: golpe real aplica ${expectedDamage} de dano uma única vez`, () => {
    const g = game();
    g.run('startGame(15); fight.roundOverlayT = 0; player.x = 300; player.y = 454; player.onGround = true; fight.boss.x = 360; fight.boss.state = "stun";');
    g.key(key);
    g.run('updateFight(); punchPressed = kickPressed = false;');
    assert.equal(g.run('player.attackT'), duration);
    g.run('for(let i=0;i<40;i++) updateFight();');
    assert.equal(g.run('FIGHT_MAX_HP - fight.bossHP'), expectedDamage);
  });
}

test('Shift esquiva na arena sem chutar; mergulho rápido acerta a cabeça', () => {
  const g = game();
  g.run('startGame(15); fight.roundOverlayT = 0;');
  g.key('ShiftLeft');
  assert.equal(g.run('kickPressed'), false);
  g.run('updateFight(); dashPressed = false;');
  assert.ok(g.run('player.dashT > 0 && player.invuln > 0'));
  g.run('player.dashT = 0; player.x = fight.boss.x; player.y = fight.boss.y - player.h - 9; player.vy = 28; player.onGround = false; player.pounding = true; updateFight();');
  assert.equal(g.run('FIGHT_MAX_HP - fight.bossHP'), 2);
  assert.equal(g.run('player.pounding'), false);
  assert.ok(g.run('player.vy < 0'));
});

test('os três vãos do aqueduto podem ser cruzados com pulo duplo e dash', () => {
  const g = game();
  for (const [edge, landing] of [[560,760],[1260,1470],[1940,2140]]) {
    g.run(`startGame(6); enemies = []; player.x = ${edge}-60; player.y = 454; player.onGround = true; keys.right = true; jumpPressed = true;`);
    for (let i = 0; i < 75; i++) {
      g.run(`jumpPressed = ${i === 0 || i === 16}; dashPressed = ${i === 21}; updatePlaying();`);
    }
    assert.ok(g.run(`player.x >= ${landing}`), `não chegou à margem ${landing}`);
    assert.equal(g.run('lives'), 3);
  }
});

test('perder a última vida no chefe conclui Game Over sem reiniciar o fade', () => {
  const g = game();
  g.run('startGame(15); fight.roundOverlayT = 0; fight.playerHP = 0; lives = 1; updatePlaying();');
  g.run('for (let i=0;i<40;i++) { updatePlaying(); updateFade(); }');
  assert.equal(g.run('state'), g.run('STATE.GAMEOVER'));
  assert.equal(g.run('lives'), 0);
});
