import assert from 'node:assert/strict';
import { computeDashboard, normalizeTileConfig, weekBounds } from './dashboard.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('✓', name); };
const today = new Date('2026-10-22T12:00:00');
const logs = [
  { completed: true, date: '2026-10-08', exercises: [{ name: 'Prensa', sets: [{ reps: '10', weight: '100', rir: 2 }] }] },
  { completed: true, date: '2026-10-15', exercises: [{ name: 'Prensa', sets: [{ reps: '10', weight: '105', rir: 2 }] }] },
  { completed: true, date: '2026-10-20', exercises: [{ name: 'Prensa', sets: [{ reps: '10', weight: '115', rir: 0 }] }, { name: 'Curl', sets: [{ reps: '12', weight: '15' }] }] },
];
const bw = [{ date: '2026-10-10', weight: 80 }, { date: '2026-10-15', weight: 79.5 }, { date: '2026-10-21', weight: 79 }];
t('weekBounds domingo a sábado', () => assert.deepEqual(weekBounds(today), { startStr: '2026-10-18', endStr: '2026-10-24' }));
t('Config: completa y respeta orden guardado', () => {
  const c = normalizeTileConfig([{ id: 'volume', visible: false }, { id: 'nope' }]);
  assert.equal(c[0].id, 'volume'); assert.equal(c[0].visible, false); assert.equal(c.length, 6);
});
t('Dashboard: semana, fuerza, peso, volumen, intensidad, récords', () => {
  const d = computeDashboard({ logs, bodyWeights: bw, today });
  assert.equal(d.week.done, 1);
  assert.equal(d.week.last7.filter(x => x.trained).length, 1);
  assert.equal(d.strength.name, 'Prensa'); assert.ok(d.strength.deltaPct > 0); assert.equal(d.strength.series.length, 3);
  assert.equal(d.bodyweight.value, 79); assert.equal(d.bodyweight.delta, -1);
  assert.equal(d.volume.series.length, 6); assert.equal(d.volume.value, 1150 + 180);
  assert.equal(d.intensity.failureSets, 1);
  assert.equal(d.records.list.length, 1);
});
t('Dashboard vacío no truena', () => {
  const d = computeDashboard({ today });
  assert.equal(d.strength, null); assert.equal(d.bodyweight, null); assert.equal(d.volume.value, 0);
});
console.log(`\n${n} pruebas OK`);
