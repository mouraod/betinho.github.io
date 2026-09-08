const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// S1 da auditoria: metadados por fase (música, velocidades, tema) vivem no
// config da fase — não mais em arrays paralelos indexados por posição.
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
  run('Sound.ensure = () => {}; Sound.blip = () => {}; Sound.startMusic = () => {}; Sound.stopMusic = () => {}; Sound.bell = () => {}; render = () => {};');
  return { run };
}

test('toda fase tem music/patrol/chase/theme no próprio config', () => {
  const g = game();
  for (let i = 0; i < 16; i++) {
    assert.equal(g.run(`typeof LEVELS[${i}].patrol`), 'number', `E${i + 1} patrol`);
    assert.equal(g.run(`typeof LEVELS[${i}].chase`), 'number', `E${i + 1} chase`);
    assert.equal(g.run(`LEVELS[${i}].music.melody.length`), 16, `E${i + 1} melodia`);
    assert.equal(g.run(`LEVELS[${i}].music.bass.length`), 4, `E${i + 1} baixo`);
    assert.ok(g.run(`["dia","tarde","noite","portao"].includes(LEVELS[${i}].theme)`), `E${i + 1} tema`);
  }
  assert.equal(g.run('BONUS_LEVEL.theme'), 'interludio');
});

test('velocidades por fase casam com o ajuste original (amostras)', () => {
  const g = game();
  const expected = { 0: [1.1, 1.4], 1: [1.5, 1.9], 7: [2.3, 2.9], 8: [2.6, 3.2], 14: [3.7, 4.4], 15: [3.2, 3.8] };
  for (const [i, [p, c]] of Object.entries(expected)) {
    assert.equal(g.run(`LEVELS[${i}].patrol`), p, `E${+i + 1} patrol`);
    assert.equal(g.run(`LEVELS[${i}].chase`), c, `E${+i + 1} chase`);
  }
});

test('paleta e noite vêm do tema da fase, não da posição no array', () => {
  const g = game();
  for (let i = 0; i < 16; i++) {
    g.run(`levelIndex = ${i}; bonusActive = false;`);
    assert.equal(g.run('sceneryPalette() === THEMES[LEVELS[levelIndex].theme]'), true, `E${i + 1} paleta`);
  }
  // noite: tarde/dia claro; floresta e portão escuros; interlúdio escuro
  assert.equal(g.run('sceneryPalette() === THEMES.dia && THEMES.dia.night'), false, 'fase 1 de dia');
  g.run('levelIndex = 7; bonusActive = false;');
  assert.equal(g.run('sceneryPalette().night'), false, 'entardecer não é noite');
  g.run('levelIndex = 10; bonusActive = false;');
  assert.equal(g.run('sceneryPalette().night'), true, 'floresta é noite');
  g.run('levelIndex = 14; bonusActive = false;');
  assert.equal(g.run('sceneryPalette().village'), true, 'portão vê a vila');
  g.run('bonusActive = true;');
  assert.equal(g.run('sceneryPalette() === THEMES.interludio'), true, 'interlúdio tem tema próprio');
});

test('cada fase inicia sua própria música (do config, não de array paralelo)', () => {
  const g = game();
  for (let i = 0; i < 16; i++) {
    g.run(`calls = []; Sound.startMusic = (m, b, s) => calls.push([JSON.stringify(m), JSON.stringify(b), s]); levelIndex = ${i}; bonusActive = false; loadLevel(${i});`);
    assert.equal(g.run('calls.length'), 1, `E${i + 1} tocou música`);
    assert.equal(g.run(`calls[0][0] === JSON.stringify(LEVELS[${i}].music.melody)`), true, `E${i + 1} melodia`);
    assert.equal(g.run(`calls[0][1] === JSON.stringify(LEVELS[${i}].music.bass)`), true, `E${i + 1} baixo`);
  }
  g.run('calls = []; Sound.startMusic = (m, b, s) => calls.push(1); levelIndex = 7; bonusActive = true; loadLevel(7);');
  assert.equal(g.run('calls.length'), 1, 'interlúdio toca a música própria');
});
