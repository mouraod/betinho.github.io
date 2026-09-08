const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

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
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8'), sandbox);
  const run = code => vm.runInContext(code, sandbox);
  run('Sound.ensure = () => {}; Sound.blip = () => {}; Sound.startMusic = () => {}; state = STATE.PLAYING;');
  return { run, listeners };
}

test('a cena de separação chega ao interlúdio jogável pelo loop principal', () => {
  const g = game();
  g.run('render = () => {}; startGame(7); enemies = []; player.x = LEVELS[7].goalX - player.w; player.y = GROUND_Y - player.h; player.onGround = true; updatePlaying();');
  g.run('for (let n = 0; n < 70; n++) updateFade();');
  assert.equal(g.run('state'), g.run('STATE.CUTSCENE'));
  g.run('scene.guard = 0; confirmPressed = true; updateScene(); narrative.guard = 0; confirmPressed = true; updateNarrative();');
  assert.equal(g.run('state'), g.run('STATE.INTERLUDE'));

  g.run('keys.right = true; last = 0; frame(STEP + 1);');
  assert.ok(g.run('player.x > BONUS_LEVEL.start.x'), 'o interlúdio precisa responder ao movimento pelo frame');
});

test('dash continua deslocando o jogador em uma etapa normal', () => {
  const g = game();
  g.run('render = () => {}; startGame(0); player.x = 100; player.y = GROUND_Y - player.h; player.onGround = true; player.facing = 1; dashPressed = true; updatePlaying();');
  assert.ok(g.run('player.dashT > 0'), 'o dash deve iniciar');
  assert.ok(g.run('player.x > 100'), 'o dash deve deslocar o jogador');
});
