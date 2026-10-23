// Pruebas de la biblioteca: node exercises/library.test.mjs
import assert from 'node:assert/strict';
import { EXERCISES, findExerciseGuide, MUSCLES } from './library.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('✓', name); };

t('Todos los ejercicios tienen campos completos y músculos válidos', () => {
  const ids = new Set();
  for (const e of EXERCISES) {
    assert.ok(!ids.has(e.id), 'id repetido ' + e.id); ids.add(e.id);
    for (const f of ['name', 'pattern', 'equipment', 'swap', 'tip']) assert.ok(e[f], `${e.id} sin ${f}`);
    for (const f of ['setup', 'steps', 'mistakes', 'primary']) assert.ok(e[f]?.length, `${e.id} sin ${f}`);
    for (const m of [...e.primary, ...e.secondary]) assert.ok(MUSCLES[m], `${e.id}: músculo ${m}`);
  }
});

t('Encuentra guías por nombre en español, inglés y variantes', () => {
  assert.equal(findExerciseGuide('Prensa').id, 'leg-press');
  assert.equal(findExerciseGuide('Prensa pies altos').id, 'leg-press-high-feet');
  assert.equal(findExerciseGuide('Barbell Incline Press').id, 'barbell-incline-press');
  assert.equal(findExerciseGuide('extensión de cuádriceps').id, 'leg-extension');
  assert.equal(findExerciseGuide('Pec deck').id, 'pec-deck');
  assert.equal(findExerciseGuide('1-Arm Reverse Pec Deck').id, 'one-arm-reverse-pec-deck');
  assert.ok(['leg-curl', 'glute-ham-raise'].includes(findExerciseGuide('Curl femoral / glute ham raise').id));
  assert.equal(findExerciseGuide('Algo inventado'), null);
});

console.log(`\n${n} pruebas OK (${EXERCISES.length} ejercicios)`);
