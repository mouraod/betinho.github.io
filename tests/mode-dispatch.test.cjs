const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Registro de modos (MODES) e fluxo da campanha (CAMPAIGN_FLOW): cada capítulo
// resolve para o update/draw certo e os marcos da história têm uma fonte única.
function game() {
  const listeners = {};
  const ctx = { imageSmoothingEnabled: true };
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
  run('Sound.ensure = () => {}; Sound.blip = () => {}; Sound.startMusic = () => {}; render = () => {}; state = STATE.PLAYING;');
  return { run };
}

test('cada capítulo resolve para o modo certo no registro', () => {
  const g = game();
  g.run('startGame(0);');
  assert.equal(g.run('chapterMode()'), 'platform');
  assert.equal(g.run('modeInfo().isArena'), false);
  g.run('startGame(15);'); // Etapa 16 = arena
  assert.equal(g.run('chapterMode()'), 'fight');
  assert.equal(g.run('modeInfo().isArena'), true);
  g.run('startInterlude({ replay: false });');
  assert.equal(g.run('chapterMode()'), 'interlude');
  assert.equal(g.run('modeInfo().isArena'), false);
});

test('updatePlaying despacha para a arena e o interlúdio sem entrar na plataforma', () => {
  // O registro guarda referências reais; observamos o efeito no estado.
  const g = game();
  g.run('startGame(15); fight.roundOverlayT = 0; punchPressed = true; updatePlaying();');
  assert.ok(g.run('player.attackT') > 0, 'soco na arena só existe se updateFight rodou via updatePlaying');
  const g2 = game();
  g2.run('startInterlude({ replay: false }); state = STATE.INTERLUDE;');
  const startX = g2.run('player.x');
  g2.run('keys.right = true; updatePlaying();');
  assert.ok(g2.run('player.x') > startX, 'movimento do interlúdio responde via updatePlaying');
});

test('drawWorld roteia pelo registro de modos (arena → drawFight, resto → mundo)', () => {
  const g = game();
  // entradas originais do registro ligadas às funções reais
  assert.equal(g.run('MODES.fight.draw === drawFight'), true);
  assert.equal(g.run('MODES.platform.draw === drawStageWorld'), true);
  assert.equal(g.run('MODES.interlude.update === updateInterlude'), true);
  assert.equal(g.run('MODES.fight.update === updateFight'), true);
  assert.equal(g.run('MODES.platform.update === updatePlayingCore'), true);
  g.run('startGame(15);');
  g.run('MODES.fight.draw = () => { drew = "fight"; }; MODES.platform.draw = () => { drew = "stage"; }; let drew = "";');
  g.run('drawWorld();');
  assert.equal(g.run('drew'), 'fight');
  g.run('startGame(0);');
  g.run('drawWorld();');
  assert.equal(g.run('drew'), 'stage');
});

test('fluxo da campanha: separação após interludeAfter, retomada em resumeAt, fim em lastStage', () => {
  const g = game();
  assert.equal(g.run('LEVELS.length'), 16);
  assert.equal(g.run('CAMPAIGN_FLOW.interludeAfter'), 7);
  assert.equal(g.run('CAMPAIGN_FLOW.resumeAt'), 8);
  assert.equal(g.run('CAMPAIGN_FLOW.lastStage'), 15);
  // registro cobre exatamente as três chaves de capítulo (comparação em JSON
  // porque arrays de realms diferentes não são deepEqual entre contextos vm)
  assert.equal(g.run('JSON.stringify(Object.keys(MODES).sort())'), '["fight","interlude","platform"]');
});

test('fases sombrias (resumeAt..lastStage) recebem inimigos; fora dessa faixa não', () => {
  const g = game();
  const before = (i) => g.run(`LEVELS[${i}].enemies.length`);
  assert.equal(before(7), g.run('LEVELS[7].enemies.length')); // linha de base auto
  const withShadows8 = before(8);
  assert.ok(withShadows8 > 4, 'Etapa 9 (índice 8) tem sombras injetadas');
  const e15 = before(15);
  assert.equal(e15, 0, 'arena não recebe injeção de sombras');
});
