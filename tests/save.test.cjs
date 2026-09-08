const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Save único versionado (betinho_save) + migração das chaves antigas.
function boot(storage) {
  const listeners = {};
  const ctx = {};
  const sandbox = {
    console, URLSearchParams, performance: { now: () => 0 },
    Image: class { complete = false; },
    location: { search: '' }, navigator: {},
    localStorage: storage,
    requestAnimationFrame() {}, setInterval: () => 1, clearInterval() {},
    window: { addEventListener: (name, fn) => { listeners[name] = fn; } },
    document: { hidden: false, getElementById: () => ({ width: 960, height: 540, getContext: () => ctx }), addEventListener() {}, querySelectorAll: () => [] },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8'), sandbox);
  const run = (code) => vm.runInContext(code, sandbox);
  run('Sound.ensure = () => {}; Sound.blip = () => {}; Sound.startMusic = () => {}; render = () => {};');
  return { run, storage };
}
function mem() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    dump: () => Object.fromEntries(map),
  };
}

test('migra as 5 chaves antigas para o save único na primeira execução', () => {
  const storage = mem();
  storage.setItem('betinho_muted', '1');
  storage.setItem('betinho_bestLevel', '12');
  storage.setItem('betinho_replayInterlude', '1');
  storage.setItem('betinho_assistInfLives', '1');
  const g = boot(storage);
  assert.equal(g.run('Sound.muted'), true);
  assert.equal(g.run('bestLevel'), 12);
  assert.equal(g.run('replayInterludeUnlocked'), true);
  assert.equal(g.run('assist.infiniteLives'), true);
  const save = JSON.parse(storage.dump().betinho_save);
  assert.equal(save.version, 1);
  assert.equal(save.muted, true);
  assert.equal(save.bestLevel, 12);
  assert.equal(save.replayInterlude, true);
  assert.equal(save.assist.infiniteLives, true);
  assert.equal(save.assist.noFallDeath, false);
  assert.equal(storage.dump().betinho_bestLevel, '12', 'chaves antigas podem permanecer (não são apagadas)');
});

test('sem save antigo, começa com padrões e grava ao salvar', () => {
  const storage = mem();
  const g = boot(storage);
  assert.equal(g.run('bestLevel'), 1);
  assert.equal(g.run('Sound.muted'), false);
  g.run('Sound.muted = true; saveMuted();');
  g.run('saveBestLevel(9);');
  const save = JSON.parse(storage.dump().betinho_save);
  assert.equal(save.version, 1);
  assert.equal(save.muted, true);
  assert.equal(save.bestLevel, 9);
});

test('save existente (versionado) é lido sem migração', () => {
  const storage = mem();
  storage.setItem('betinho_save', JSON.stringify({ version: 1, muted: true, bestLevel: 16, replayInterlude: true, assist: { infiniteLives: true, noFallDeath: true } }));
  const g = boot(storage);
  assert.equal(g.run('bestLevel'), 16);
  assert.equal(g.run('Sound.muted'), true);
  assert.equal(g.run('assist.noFallDeath'), true);
  // nenhuma escrita de migração deve ocorrer em cima de um save atual
  assert.equal(storage.dump().betinho_bestLevel, undefined);
});
