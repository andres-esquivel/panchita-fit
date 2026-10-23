// Pruebas del motor: node strength/engine.test.mjs
import assert from 'node:assert/strict';
import * as E from './engine.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
let n = 0; const t = (name, fn) => { fn(); n++; console.log('✓', name); };

t('%1RM: 10 reps RIR 2 ≈ 71 %', () => near(E.pct1RM(10, 2), 0.710, 0.002, 'pct'));
t('%1RM: 1 rep RIR 0 ≈ 97 %', () => near(E.pct1RM(1, 0), 0.970, 0.002, 'pct'));
t('restFactor baja con más descanso', () => {
  assert.ok(E.restFactor(60) > E.restFactor(180));
  near(E.restFactor(11 * 60), 0.05, 1e-9, '>10min');
});
t('Fatiga: 10 reps RIR 0, 3 min → −7 %', () => near(E.nextSetWeightRatio(10, 0, 180), 0.930, 0.002, 'r'));
t('Fatiga: 10 reps RIR 2, 3 min → −4.2 %', () => near(E.nextSetWeightRatio(10, 2, 180), 0.958, 0.002, 'r'));
t('Fatiga: más descanso → menos bajada', () => assert.ok(E.nextSetWeightRatio(10, 2, 300) > E.nextSetWeightRatio(10, 2, 90)));
t('Redondeo kg 0.5 / lb 1', () => { assert.equal(E.roundWeight(82.3, 'kg'), 82.5); assert.equal(E.roundWeight(181.4, 'lb'), 181); });
t('exerciseId estable', () => assert.equal(E.exerciseIdFromName(' Extensión de Cuádriceps '), 'extension-de-cuadriceps'));
t('Modelo con una sesión usa curva por defecto y reproduce el peso', () => {
  const m = E.fitExerciseModel([{ weightKg: 100, reps: 8, rir: 2, date: '2026-10-01' }]);
  assert.equal(m.base, E.DEFAULT_BASE);
  near(E.predictWeightKg(m, 8, 2), 100, 1e-6, 'pred');
  assert.ok(E.predictWeightKg(m, 10, 2) < 100);
});
t('Modelo con variedad de reps acota la base', () => {
  const pts = [
    { weightKg: 100, reps: 8, rir: 2, date: '2026-10-01' },
    { weightKg: 90, reps: 12, rir: 1, date: '2026-10-01' },
    { weightKg: 110, reps: 5, rir: 2, date: '2026-10-08' },
    { weightKg: 85, reps: 14, rir: 1, date: '2026-10-08' },
  ];
  const m = E.fitExerciseModel(pts);
  assert.ok(m.base >= E.MIN_BASE && m.base <= E.MAX_BASE);
  assert.ok(m.e1rmKg > 110);
});
t('Logs viejos (texto, sin RIR) generan puntos', () => {
  const logs = [{ completed: true, date: '2026-10-01', exercises: [{ name: 'Prensa', unit: 'lb', sets: [{ reps: '10', weight: '220' }, { reps: '', weight: '200' }] }] }];
  const pts = E.exercisePointsFromLogs(logs, 'prensa');
  assert.equal(pts.length, 1);
  near(pts[0].weightKg, 99.79, 0.01, 'kg');
  assert.equal(pts[0].rir, null);
});
t('Sugerencia: con serie previa hoy ajusta por fatiga', () => {
  const s = E.suggestSet({ model: null, prevSetToday: { weightKg: 100, reps: 10, rir: 2 }, restSec: 180 });
  assert.equal(s.source, 'fatigue'); near(s.weightKg, 95.8, 0.2, 'w');
});
t('Sugerencia: sin serie previa usa el modelo', () => {
  const m = E.fitExerciseModel([{ weightKg: 100, reps: 8, rir: 2, date: '2026-10-01' }]);
  const s = E.suggestSet({ model: m, target: { reps: 8, rir: 2 } });
  assert.equal(s.source, 'model'); near(s.weightKg, 100, 1e-6, 'w');
});
t('Calentamiento 100 kg', () => assert.deepEqual(E.warmupWeights(100, 'kg'), [40, 60, 80, 95]));
t('Calentamiento ligero se omite', () => assert.deepEqual(E.warmupWeights(15, 'kg'), []));
t('Serie de 1RM estimado por fecha', () => {
  const logs = [
    { completed: true, date: '2026-10-01', exercises: [{ name: 'Prensa', sets: [{ reps: '10', weight: '100', rir: '2' }] }] },
    { completed: true, date: '2026-10-08', exercises: [{ name: 'Prensa', sets: [{ reps: '10', weight: '105', rir: '2' }] }] },
  ];
  const s = E.e1rmSeries(logs, 'prensa');
  assert.equal(s.length, 2); assert.ok(s[1].e1rm > s[0].e1rm);
});
t('Récord: supera el mejor previo', () => {
  assert.equal(E.isNewRecord(130, 105, 10, 2), true);
  assert.equal(E.isNewRecord(150, 105, 10, 2), false);
});
t('Resumen semanal: volumen, RIR y récords', () => {
  const logs = [
    { completed: true, date: '2026-10-01', exercises: [{ name: 'Prensa', sets: [{ reps: '10', weight: '100', rir: '2' }] }] },
    { completed: true, date: '2026-10-19', exercises: [{ name: 'Prensa', unit: 'lb', sets: [{ reps: '10', weight: '242', rir: 0 }, { reps: '8', weight: '220', rir: 2 }] }] },
  ];
  const r = E.weeklyStrengthSummary(logs, '2026-10-18', '2026-10-24');
  assert.equal(r.failureSets, 1); assert.equal(r.rirSets, 2); assert.equal(r.avgRir, 1);
  assert.equal(r.records.length, 1); assert.equal(r.records[0].name, 'Prensa');
  near(r.volumeKg, 1897, 2, 'vol');
});
console.log(`\n${n} pruebas OK`);
