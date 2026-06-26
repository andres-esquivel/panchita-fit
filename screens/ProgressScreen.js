import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, SafeAreaView,
  TouchableOpacity, TextInput, Dimensions, Modal, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { RADIUS } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { IconEditar, IconEliminar } from '../components/icons';
import {
  getWeeklyFrequency, getExerciseProgress, getAllTrackedExercises,
  getBestProgressExercise, getBodyWeights, saveBodyWeight, deleteBodyWeight,
  getWeekActivity, getLogs, getWeeklyReviews,
} from '../storage';

const SCREEN_W = Dimensions.get('window').width;
const CHART_W  = SCREEN_W - 48;

// ─── Gráfica de barras ────────────────────────────────────
function BarChart({ data, barColor, labelColor, height = 100 }) {
  const maxVal = Math.max(...data.map(d => d.count), 1);
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap: 4 }}>
        {data.map((d, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center', height, justifyContent: 'flex-end' }}>
            <View style={{
              width: '80%',
              height: Math.max((d.count / maxVal) * (height - 20), d.count > 0 ? 4 : 2),
              backgroundColor: d.count > 0 ? barColor : barColor + '33',
              borderRadius: 4,
            }} />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', marginTop: 6, gap: 4 }}>
        {data.map((d, i) => (
          <Text key={i} style={{ flex: 1, fontSize: 9, color: labelColor, textAlign: 'center' }}>
            {d.weekLabel}
          </Text>
        ))}
      </View>
    </View>
  );
}

// ─── Segmento de línea ────────────────────────────────────
function LineSegment({ x1, y1, x2, y2, color, thickness = 2 }) {
  const dx = x2 - x1, dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length < 1) return null;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  return (
    <View style={{
      position: 'absolute',
      left: (x1 + x2) / 2 - length / 2,
      top:  (y1 + y2) / 2 - thickness / 2,
      width: length, height: thickness,
      backgroundColor: color, borderRadius: thickness,
      transform: [{ rotate: `${angle}deg` }],
    }} />
  );
}

// ─── Gráfica de línea con escala fija (min−2 … max+2) ────
function LineChart({ data, valueKey = 'value', labelKey = 'label', lineColor, dotColor, labelColor, height = 140 }) {
  if (!data || data.length < 2) {
    return (
      <View style={{ height, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: labelColor, fontSize: 12 }}>Sin suficientes datos aún</Text>
      </View>
    );
  }
  const values  = data.map(d => d[valueKey]);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  // Escala: mín−2 hasta máx+2 — diferencias pequeñas se ven casi horizontales
  const minVal  = Math.floor(dataMin) - 2;
  const maxVal  = Math.ceil(dataMax)  + 2;
  const range   = maxVal - minVal;
  const padH = 16, padW = 32; // más padding horizontal para etiquetas Y

  const toY = v => padH + (1 - (v - minVal) / range) * (height - padH * 2);
  const toX = i => padW + (i / (data.length - 1)) * (CHART_W - padW * 2);

  // Líneas de referencia cada 1kg
  const refLines = [];
  for (let kg = Math.ceil(minVal); kg <= Math.floor(maxVal); kg++) {
    refLines.push(kg);
  }

  const points = data.map((d, i) => ({
    x: toX(i), y: toY(d[valueKey]),
    label: d[labelKey], value: d[valueKey],
  }));

  return (
    <View style={{ width: CHART_W, height }}>
      {/* Líneas de referencia horizontales */}
      {refLines.map(kg => {
        const y = toY(kg);
        return (
          <React.Fragment key={kg}>
            <View style={{
              position: 'absolute', left: padW, right: 6, top: y,
              height: 1, backgroundColor: labelColor + '25',
            }} />
            <Text style={{
              position: 'absolute', left: 0, top: y - 7,
              width: padW - 4, fontSize: 8, color: labelColor + '88',
              textAlign: 'right',
            }}>
              {kg}
            </Text>
          </React.Fragment>
        );
      })}

      {/* Líneas de datos */}
      {points.slice(0, -1).map((p, i) => (
        <LineSegment key={i} x1={p.x} y1={p.y} x2={points[i+1].x} y2={points[i+1].y} color={lineColor} thickness={2.5} />
      ))}

      {/* Dots y valores */}
      {points.map((p, i) => (
        <React.Fragment key={i}>
          <View style={{
            position: 'absolute', left: p.x - 5, top: p.y - 5,
            width: 10, height: 10, borderRadius: 5,
            backgroundColor: dotColor, borderWidth: 2, borderColor: lineColor,
          }} />
          {/* Valor: alternar arriba/abajo para no solaparse */}
          <Text style={{
            position: 'absolute', left: p.x - 20, top: i % 2 === 0 ? p.y - 18 : p.y + 7,
            width: 40, fontSize: 9, color: labelColor, textAlign: 'center', fontWeight: '600',
          }}>
            {p.value % 1 === 0 ? p.value : p.value.toFixed(1)}
          </Text>
        </React.Fragment>
      ))}

      {/* Etiquetas X: primera y última */}
      <Text style={{ position: 'absolute', left: padW - 4, top: height - 12, fontSize: 9, color: labelColor }}>
        {points[0]?.label}
      </Text>
      <Text style={{ position: 'absolute', right: 2, top: height - 12, fontSize: 9, color: labelColor, textAlign: 'right' }}>
        {points[points.length - 1]?.label}
      </Text>
    </View>
  );
}

// ─── DatePicker custom (ruedas de scroll) ─────────────────
const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const ITEM_H = 44;
const VISIBLE = 3; // items visibles

function WheelPicker({ items, selectedIndex, onSelect, width = 64 }) {
  const scrollRef = useRef(null);
  const snapOffsets = items.map((_, i) => i * ITEM_H);

  // Scroll al item inicial
  React.useEffect(() => {
    if (scrollRef.current) {
      setTimeout(() => scrollRef.current?.scrollTo({ y: selectedIndex * ITEM_H, animated: false }), 50);
    }
  }, [selectedIndex]);

  return (
    <View style={{ width, height: ITEM_H * VISIBLE, overflow: 'hidden' }}>
      {/* Líneas de selección */}
      <View style={{ position: 'absolute', left: 0, right: 0, top: ITEM_H, height: ITEM_H, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#a78bfa55', pointerEvents: 'none' }} />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToOffsets={snapOffsets}
        decelerationRate="fast"
        onMomentumScrollEnd={e => {
          const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
          onSelect(Math.max(0, Math.min(idx, items.length - 1)));
        }}
        contentContainerStyle={{ paddingVertical: ITEM_H }}
      >
        {items.map((item, i) => (
          <View key={i} style={{ height: ITEM_H, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{
              fontSize: i === selectedIndex ? 18 : 14,
              fontWeight: i === selectedIndex ? '700' : '400',
              color: i === selectedIndex ? '#fff' : '#ffffff55',
            }}>
              {String(item).padStart(2, '0')}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Helpers ──────────────────────────────────────────────
function formatDateDisplay(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

function daysInMonth(month, year) {
  return new Date(year, month, 0).getDate(); // month es 1-based
}

// ─── Pantalla principal ───────────────────────────────────
export default function ProgressScreen() {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);

  const [weekFreq, setWeekFreq]           = useState([]);
  const [exProgress, setExProgress]       = useState([]);
  const [bodyWeights, setBodyWeights]     = useState([]);
  const [exercises, setExercises]         = useState([]);
  const [selectedEx, setSelectedEx]       = useState(null);
  const [bestProgress, setBestProgress]   = useState(null);
  const [streak, setStreak]               = useState(0);
  const [thisWeekCount, setThisWeekCount] = useState(0);
  const [lastWeekCount, setLastWeekCount] = useState(0);
  const [weeklyReviews, setWeeklyReviews] = useState([]);
  const [showingReviews, setShowingReviews] = useState(false);

  const [weightInput, setWeightInput]     = useState('');
  const [weightSaved, setWeightSaved]     = useState(false);

  // Modal editar
  const [editModal, setEditModal]         = useState(false);
  const [editEntry, setEditEntry]         = useState(null);
  const [editWeight, setEditWeight]       = useState('');

  // Modal agregar pasado — fecha con ruedas
  const today = new Date();
  const [addModal, setAddModal]           = useState(false);
  const [addDayIdx, setAddDayIdx]         = useState(today.getDate() - 1);
  const [addMonthIdx, setAddMonthIdx]     = useState(today.getMonth()); // 0-based
  const [addYearIdx, setAddYearIdx]       = useState(0);
  const [addWeight, setAddWeight]         = useState('');
  const [addError, setAddError]           = useState('');

  const YEARS = [];
  for (let y = today.getFullYear(); y >= 2020; y--) YEARS.push(y);
  const selectedYear  = YEARS[addYearIdx];
  const selectedMonth = addMonthIdx + 1; // 1-based
  const maxDays       = daysInMonth(selectedMonth, selectedYear);
  const DAYS          = Array.from({ length: maxDays }, (_, i) => i + 1);
  const safeDayIdx    = Math.min(addDayIdx, maxDays - 1);

  function selectedIso() {
    const d = DAYS[safeDayIdx];
    const m = selectedMonth;
    const y = selectedYear;
    return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }
  function isDateFuture(iso) { return iso > today.toISOString().split('T')[0]; }
  function isDateDuplicate(iso) { return bodyWeights.some(w => w.date === iso); }

  useFocusEffect(useCallback(() => { loadAll(); }, []));

  async function loadAll() {
    const todayStr = today.toISOString().split('T')[0];
    const [freq, allEx, best, weights, activity, logs, reviews] = await Promise.all([
      getWeeklyFrequency(8), getAllTrackedExercises(), getBestProgressExercise(),
      getBodyWeights(), getWeekActivity(), getLogs(), getWeeklyReviews(),
    ]);
    setWeekFreq(freq); setExercises(allEx); setBestProgress(best);
    setBodyWeights(weights); setWeeklyReviews(reviews);

    let s = 0;
    for (const day of [...activity].reverse()) { if (day.trained) s++; else break; }
    setStreak(s);
    setThisWeekCount(activity.filter(d => d.trained).length);
    const lastWeekDates = [];
    for (let i = 13; i >= 7; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      lastWeekDates.push(d.toISOString().split('T')[0]);
    }
    setLastWeekCount(new Set(logs.filter(l => l.completed && lastWeekDates.includes(l.date)).map(l => l.date)).size);

    if (allEx.length > 0 && !selectedEx) {
      setSelectedEx(allEx[0]);
      setExProgress(await getExerciseProgress(allEx[0]));
    } else if (selectedEx) {
      setExProgress(await getExerciseProgress(selectedEx));
    }
    const todayW = weights.find(w => w.date === todayStr);
    if (todayW) setWeightInput(String(todayW.weight));
  }

  async function refreshWeights() { setBodyWeights(await getBodyWeights()); }

  async function handleSaveWeight() {
    const val = parseFloat(weightInput.replace(',', '.'));
    if (isNaN(val) || val <= 0 || val > 300) return;
    await saveBodyWeight({ date: today.toISOString().split('T')[0], weight: val });
    setWeightSaved(true);
    setTimeout(() => setWeightSaved(false), 2000);
    await refreshWeights();
  }

  function openEdit(entry) { setEditEntry(entry); setEditWeight(String(entry.weight)); setEditModal(true); }
  async function saveEdit() {
    const val = parseFloat(editWeight.replace(',', '.'));
    if (isNaN(val) || val <= 0 || val > 300) return;
    await saveBodyWeight({ date: editEntry.date, weight: val });
    setEditModal(false); await refreshWeights();
  }

  function confirmDelete(entry) {
    Alert.alert('Eliminar registro', `¿Eliminar el registro del ${formatDateDisplay(entry.date)} (${entry.weight} kg)?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
        await deleteBodyWeight(entry.date); await refreshWeights();
      }},
    ]);
  }

  function openAdd() {
    setAddDayIdx(today.getDate() - 1);
    setAddMonthIdx(today.getMonth());
    setAddYearIdx(0);
    setAddWeight(''); setAddError('');
    setAddModal(true);
  }
  async function saveAdd() {
    const iso = selectedIso();
    if (isDateFuture(iso)) { setAddError('No podés agregar una fecha futura'); return; }
    if (isDateDuplicate(iso)) { setAddError(`Ya existe un registro para el ${formatDateDisplay(iso)}`); return; }
    const val = parseFloat(addWeight.replace(',', '.'));
    if (isNaN(val) || val <= 0 || val > 300) { setAddError('Peso inválido'); return; }
    await saveBodyWeight({ date: iso, weight: val });
    setAddModal(false); await refreshWeights();
  }

  async function selectExercise(name) { setSelectedEx(name); setExProgress(await getExerciseProgress(name)); }

  const weekDelta       = thisWeekCount - lastWeekCount;
  const exChartData     = exProgress.slice(-10).map(p => ({ value: p.maxWeight, label: p.date.slice(5) }));
  const weightChartData = [...bodyWeights].slice(-14).map(w => ({ value: w.weight, label: w.date.slice(5) }));
  const weightHistory   = [...bodyWeights].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.pageTitle}>Progreso</Text>

        {/* Resumen */}
        <View style={s.statsRow}>
          {[
            { num: streak,        label: 'días seguidos' },
            { num: thisWeekCount, label: 'esta semana',  delta: weekDelta },
            { num: lastWeekCount, label: 'semana ant.' },
          ].map(({ num, label, delta }, i) => (
            <View key={i} style={[s.statCard, { flex: 1 }]}>
              <Text style={s.statNum}>{num}</Text>
              <Text style={s.statLabel}>{label}</Text>
              {delta != null && delta !== 0 && (
                <Text style={[s.statDelta, { color: delta > 0 ? colors.lime : colors.danger }]}>
                  {delta > 0 ? `+${delta}` : delta} vs ant.
                </Text>
              )}
            </View>
          ))}
        </View>

        {/* Mejor progreso */}
        {bestProgress && (
          <View style={s.bestCard}>
            <Text style={s.sectionTitle}>Mayor progreso esta semana</Text>
            <Text style={s.bestExName}>{bestProgress.name}</Text>
            <View style={s.bestRow}>
              <View style={s.bestItem}><Text style={s.bestVal}>{bestProgress.lastWeek} kg</Text><Text style={s.bestItemLabel}>semana ant.</Text></View>
              <Text style={s.bestArrow}>→</Text>
              <View style={s.bestItem}><Text style={[s.bestVal, { color: colors.lime }]}>{bestProgress.thisWeek} kg</Text><Text style={s.bestItemLabel}>esta semana</Text></View>
              <View style={[s.deltaBadge, { backgroundColor: colors.lime + '33' }]}>
                <Text style={[s.deltaTxt, { color: colors.lime }]}>+{bestProgress.delta} kg</Text>
              </View>
            </View>
          </View>
        )}

        {/* Frecuencia semanal */}
        <View style={s.chartCard}>
          <Text style={s.sectionTitle}>Frecuencia semanal</Text>
          <Text style={s.sectionSub}>días entrenados por semana</Text>
          {weekFreq.length > 0
            ? <BarChart data={weekFreq} barColor={colors.purple} labelColor={colors.gray} height={110} />
            : <Text style={s.emptyChartTxt}>Completá tu primera sesión para ver datos</Text>}
        </View>

        {/* Carga por ejercicio */}
        <View style={s.chartCard}>
          <Text style={s.sectionTitle}>Carga por ejercicio</Text>
          {exercises.length === 0 ? (
            <Text style={s.emptyChartTxt}>Registrá pesos en tus entrenamientos para ver progreso</Text>
          ) : (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                {exercises.map(ex => (
                  <TouchableOpacity key={ex} style={[s.exChip, selectedEx === ex && s.exChipActive]} onPress={() => selectExercise(ex)}>
                    <Text style={[s.exChipTxt, selectedEx === ex && s.exChipTxtActive]} numberOfLines={1}>{ex}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {exChartData.length >= 2
                ? <LineChart data={exChartData} lineColor={colors.purple} dotColor={colors.bgCard} labelColor={colors.gray} height={140} />
                : <Text style={s.emptyChartTxt}>Necesitás al menos 2 sesiones con {selectedEx} para ver la línea</Text>}
              {exChartData.length > 0 && <Text style={s.chartUnit}>peso máximo por sesión (kg)</Text>}
            </>
          )}
        </View>

        {/* Peso corporal */}
        <View style={s.chartCard}>
          <Text style={s.sectionTitle}>Peso corporal</Text>
          <Text style={s.sectionSub}>Registrá tu peso de hoy</Text>
          <View style={s.weightInputRow}>
            <TextInput style={s.weightInput} value={weightInput} onChangeText={setWeightInput}
              placeholder="0.0" placeholderTextColor={colors.gray} keyboardType="decimal-pad" />
            <Text style={s.weightUnit}>kg</Text>
            <TouchableOpacity style={[s.weightBtn, weightSaved && { backgroundColor: colors.lime }]} onPress={handleSaveWeight}>
              <Text style={[s.weightBtnTxt, weightSaved && { color: '#0f0a1e' }]}>
                {weightSaved ? '✓ Guardado' : 'Guardar hoy'}
              </Text>
            </TouchableOpacity>
          </View>

          {weightChartData.length >= 2 ? (
            <View style={{ marginTop: 16 }}>
              <LineChart data={weightChartData} lineColor={colors.teal} dotColor={colors.bgCard} labelColor={colors.gray} height={140} />
              <Text style={s.chartUnit}>últimos 14 registros (kg)</Text>
            </View>
          ) : (
            <Text style={[s.emptyChartTxt, { marginTop: 12 }]}>
              Registrá al menos 2 días de peso para ver la gráfica
            </Text>
          )}

          <TouchableOpacity style={s.addPastBtn} onPress={openAdd}>
            <Text style={s.addPastBtnTxt}>+ Agregar registro anterior</Text>
          </TouchableOpacity>

          {weightHistory.length > 0 && (
            <View style={{ marginTop: 16 }}>
              <Text style={[s.sectionTitle, { marginBottom: 10 }]}>Historial</Text>
              {weightHistory.map(entry => (
                <View key={entry.date} style={s.historyRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.historyDate}>{formatDateDisplay(entry.date)}</Text>
                    <Text style={s.historyWeight}>{entry.weight} kg</Text>
                  </View>
                  <TouchableOpacity style={s.historyActionBtn} onPress={() => openEdit(entry)}>
                    <IconEditar size={18} color={colors.purpleLight} />
                  </TouchableOpacity>
                  <TouchableOpacity style={s.historyActionBtn} onPress={() => confirmDelete(entry)}>
                    <IconEliminar size={18} color="#f87171" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Cierres semanales */}
        {weeklyReviews.length > 0 && (
          <View style={s.chartCard}>
            <TouchableOpacity style={s.reviewsHeader} onPress={() => setShowingReviews(v => !v)}>
              <Text style={s.sectionTitle}>Cierres semanales</Text>
              <Text style={s.reviewsToggle}>{showingReviews ? '▲ Ocultar' : '▼ Ver historial'}</Text>
            </TouchableOpacity>
            {showingReviews && weeklyReviews.map(review => (
              <View key={review.id} style={s.reviewCard}>
                <View style={s.reviewCardHeader}>
                  <Text style={s.reviewWeek}>{review.weekEnd}</Text>
                  <View style={[s.reviewDaysBadge, {
                    backgroundColor: review.daysCompleted >= review.daysPlanned ? colors.lime + '33' : colors.purpleDim,
                  }]}>
                    <Text style={[s.reviewDaysNum, {
                      color: review.daysCompleted >= review.daysPlanned ? colors.lime : colors.purpleLight,
                    }]}>{review.daysCompleted}/{review.daysPlanned} días</Text>
                  </View>
                </View>
                {review.volumeLastWeek > 0 && (
                  <Text style={s.reviewVolume}>
                    Volumen: {review.volumeThisWeek?.toLocaleString() ?? '—'} kg
                    {review.volumeDeltaPct !== 0 ? ` (${review.volumeDeltaPct > 0 ? '+' : ''}${review.volumeDeltaPct}%)` : ''}
                  </Text>
                )}
                {review.reflection && <Text style={s.reviewReflection}>💬 "{review.reflection}"</Text>}
                {review.nextGoal   && <Text style={s.reviewGoal}>🎯 {review.nextGoal}</Text>}
                {review.panchitaResponse && <Text style={s.reviewPanchita}>Panchita: "{review.panchitaResponse}"</Text>}
              </View>
            ))}
          </View>
        )}

        <Text style={s.footer}>Panchita analiza tus datos.{'\n'}Comé proteína. Los números no mienten.</Text>
      </ScrollView>

      {/* Modal editar */}
      <Modal visible={editModal} transparent animationType="fade" onRequestClose={() => setEditModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>Editar registro</Text>
            {editEntry && <Text style={s.modalSubtitle}>{formatDateDisplay(editEntry.date)}</Text>}
            <View style={s.modalInputRow}>
              <TextInput style={s.modalInput} value={editWeight} onChangeText={setEditWeight}
                keyboardType="decimal-pad" placeholder="0.0" placeholderTextColor={colors.gray} autoFocus />
              <Text style={s.modalUnit}>kg</Text>
            </View>
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.modalCancelBtn} onPress={() => setEditModal(false)}>
                <Text style={s.modalCancelTxt}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalSaveBtn} onPress={saveEdit}>
                <Text style={s.modalSaveTxt}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal agregar pasado — date picker con ruedas */}
      <Modal visible={addModal} transparent animationType="slide" onRequestClose={() => setAddModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>Agregar registro</Text>

            {/* Vista previa de fecha */}
            <Text style={s.datePreview}>
              {formatDateDisplay(selectedIso())}
              {isDateFuture(selectedIso()) ? '  ⚠ fecha futura' : ''}
              {isDateDuplicate(selectedIso()) ? '  ⚠ ya registrada' : ''}
            </Text>

            {/* Ruedas de fecha */}
            <View style={s.wheelRow}>
              <View style={{ alignItems: 'center' }}>
                <Text style={s.wheelLabel}>Día</Text>
                <WheelPicker items={DAYS} selectedIndex={safeDayIdx} onSelect={setAddDayIdx} width={56} />
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={s.wheelLabel}>Mes</Text>
                <WheelPicker items={MONTHS} selectedIndex={addMonthIdx} onSelect={setAddMonthIdx} width={64} />
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={s.wheelLabel}>Año</Text>
                <WheelPicker items={YEARS} selectedIndex={addYearIdx} onSelect={setAddYearIdx} width={72} />
              </View>
            </View>

            {/* Peso */}
            <Text style={[s.modalSubtitle, { marginTop: 16 }]}>Peso</Text>
            <View style={s.modalInputRow}>
              <TextInput style={s.modalInput} value={addWeight} onChangeText={v => { setAddWeight(v); setAddError(''); }}
                keyboardType="decimal-pad" placeholder="0.0" placeholderTextColor={colors.gray} />
              <Text style={s.modalUnit}>kg</Text>
            </View>
            {addError ? <Text style={s.modalError}>{addError}</Text> : null}

            <View style={s.modalBtns}>
              <TouchableOpacity style={s.modalCancelBtn} onPress={() => setAddModal(false)}>
                <Text style={s.modalCancelTxt}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalSaveBtn} onPress={saveAdd}>
                <Text style={s.modalSaveTxt}>Agregar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    safe:             { flex: 1, backgroundColor: colors.bg },
    scroll:           { padding: 20, paddingBottom: 60 },
    pageTitle:        { fontSize: 30, fontWeight: '800', color: colors.white, marginBottom: 20 },
    statsRow:         { flexDirection: 'row', gap: 10, marginBottom: 16 },
    statCard:         { backgroundColor: colors.bgCard, borderRadius: RADIUS.lg, padding: 14, alignItems: 'center' },
    statNum:          { fontSize: 26, fontWeight: '800', color: colors.lime },
    statLabel:        { fontSize: 11, color: colors.gray, marginTop: 2, textAlign: 'center' },
    statDelta:        { fontSize: 11, fontWeight: '700', marginTop: 2 },
    bestCard:         { backgroundColor: colors.bgCard, borderRadius: RADIUS.lg, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.purpleDim },
    bestExName:       { fontSize: 17, fontWeight: '700', color: colors.white, marginBottom: 12 },
    bestRow:          { flexDirection: 'row', alignItems: 'center', gap: 10 },
    bestItem:         { alignItems: 'center' },
    bestVal:          { fontSize: 18, fontWeight: '700', color: colors.white },
    bestItemLabel:    { fontSize: 10, color: colors.gray, marginTop: 2 },
    bestArrow:        { fontSize: 18, color: colors.gray },
    deltaBadge:       { marginLeft: 'auto', borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 5 },
    deltaTxt:         { fontWeight: '800', fontSize: 14 },
    chartCard:        { backgroundColor: colors.bgCard, borderRadius: RADIUS.lg, padding: 16, marginBottom: 16 },
    sectionTitle:     { fontSize: 15, fontWeight: '700', color: colors.white, marginBottom: 2 },
    sectionSub:       { fontSize: 12, color: colors.gray, marginBottom: 14 },
    emptyChartTxt:    { fontSize: 13, color: colors.gray, textAlign: 'center', paddingVertical: 20, fontStyle: 'italic' },
    chartUnit:        { fontSize: 10, color: colors.gray, textAlign: 'center', marginTop: 8 },
    exChip:           { backgroundColor: colors.bgInput, borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 7, marginRight: 8, borderWidth: 1, borderColor: colors.purpleDim, maxWidth: 140 },
    exChipActive:     { backgroundColor: colors.purple, borderColor: colors.purple },
    exChipTxt:        { fontSize: 12, color: colors.gray },
    exChipTxtActive:  { color: '#fff', fontWeight: '600' },
    weightInputRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
    weightInput:      { backgroundColor: colors.bgInput, borderRadius: RADIUS.md, padding: 12, fontSize: 20, color: colors.white, fontWeight: '700', width: 90, textAlign: 'center', borderWidth: 1, borderColor: colors.purpleDim },
    weightUnit:       { fontSize: 15, color: colors.gray, fontWeight: '600' },
    weightBtn:        { flex: 1, backgroundColor: colors.purple, borderRadius: RADIUS.full, paddingVertical: 13, alignItems: 'center' },
    weightBtnTxt:     { color: '#fff', fontWeight: '700', fontSize: 14 },
    addPastBtn:       { marginTop: 14, alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 14, borderRadius: RADIUS.full, borderWidth: 1, borderColor: colors.purpleDim },
    addPastBtnTxt:    { fontSize: 13, color: colors.purpleLight, fontWeight: '600' },
    historyRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.purpleDim + '50' },
    historyDate:      { fontSize: 12, color: colors.gray },
    historyWeight:    { fontSize: 17, fontWeight: '700', color: colors.white, marginTop: 2 },
    historyActionBtn: { padding: 8 },
    footer:           { fontSize: 12, color: colors.gray, textAlign: 'center', marginTop: 16, lineHeight: 18, fontStyle: 'italic' },
    reviewsHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    reviewsToggle:    { fontSize: 12, color: colors.purpleLight },
    reviewCard:       { backgroundColor: colors.bgInput, borderRadius: RADIUS.md, padding: 14, marginTop: 10, borderWidth: 1, borderColor: colors.purpleDim + '80' },
    reviewCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    reviewWeek:       { fontSize: 13, color: colors.gray, fontWeight: '600' },
    reviewDaysBadge:  { borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 4 },
    reviewDaysNum:    { fontSize: 12, fontWeight: '800' },
    reviewVolume:     { fontSize: 12, color: colors.gray, marginBottom: 6 },
    reviewReflection: { fontSize: 13, color: colors.white, fontStyle: 'italic', marginBottom: 6, lineHeight: 18 },
    reviewGoal:       { fontSize: 13, color: colors.purpleLight, marginBottom: 4 },
    reviewPanchita:   { fontSize: 12, color: colors.gray, fontStyle: 'italic' },
    // Modales
    modalOverlay:     { flex: 1, backgroundColor: '#00000099', justifyContent: 'center', alignItems: 'center', padding: 20 },
    modalBox:         { backgroundColor: colors.bgCard, borderRadius: RADIUS.lg, padding: 24, width: '100%', borderWidth: 1, borderColor: colors.purpleDim },
    modalTitle:       { fontSize: 18, fontWeight: '800', color: colors.white, marginBottom: 4 },
    modalSubtitle:    { fontSize: 13, color: colors.gray, marginBottom: 10 },
    modalInputRow:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
    modalInput:       { backgroundColor: colors.bgInput, borderRadius: RADIUS.md, paddingHorizontal: 16, paddingVertical: 12, fontSize: 22, color: colors.white, fontWeight: '700', flex: 1, textAlign: 'center', borderWidth: 1, borderColor: colors.purpleDim },
    modalUnit:        { fontSize: 16, color: colors.gray, fontWeight: '600' },
    modalError:       { color: '#f87171', fontSize: 13, marginTop: 8 },
    modalBtns:        { flexDirection: 'row', gap: 10, marginTop: 20 },
    modalCancelBtn:   { flex: 1, paddingVertical: 13, borderRadius: RADIUS.full, borderWidth: 1, borderColor: colors.purpleDim, alignItems: 'center' },
    modalCancelTxt:   { color: colors.gray, fontWeight: '600' },
    modalSaveBtn:     { flex: 1, paddingVertical: 13, borderRadius: RADIUS.full, backgroundColor: colors.purple, alignItems: 'center' },
    modalSaveTxt:     { color: '#fff', fontWeight: '700' },
    // Wheel picker
    datePreview:      { fontSize: 17, fontWeight: '700', color: colors.white, textAlign: 'center', marginBottom: 16 },
    wheelRow:         { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 4 },
    wheelLabel:       { fontSize: 11, color: colors.gray, marginBottom: 4, textAlign: 'center' },
  });
}
