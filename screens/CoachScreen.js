import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, SafeAreaView,
  TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { RADIUS } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import {
  getUser, getLogs, getWeekActivity,
  getRecentMuscleActivity, getBestProgressExercise,
  getBodyWeights, getWeeklyFrequency,
} from '../storage';
import Panchita from '../components/Panchita';
import { GROQ_API_KEY, GROQ_MODEL } from '../config';

const SUGGESTIONS = [
  '¿Cómo voy esta semana?',
  '¿Qué músculo debería trabajar hoy?',
  'Dame motivación',
  '¿Cuándo fue mi último entrenamiento?',
  '¿Tengo dolor muscular, entreno igual?',
];

function buildContext(user, logs, activity) {
  const completedLogs = logs.filter(l => l.completed).sort((a, b) => b.date.localeCompare(a.date));
  const lastLog = completedLogs[0];
  const trainedDays = activity.filter(d => d.trained).length;
  const today = new Date().toISOString().split('T')[0];
  const daysSinceLast = lastLog
    ? Math.floor((new Date(today) - new Date(lastLog.date)) / (1000 * 60 * 60 * 24))
    : null;
  return {
    name: user?.name || 'atleta',
    totalSessions: completedLogs.length,
    trainedThisWeek: trainedDays,
    lastWorkoutDate: lastLog?.date || null,
    daysSinceLastWorkout: daysSinceLast,
  };
}

function buildSystemPrompt(ctx) {
  const lastInfo = ctx.lastWorkoutDate
    ? 'hace ' + ctx.daysSinceLastWorkout + ' dias'
    : 'nunca (primer dia en el templo)';
  return `Sos Panchita, mascota salchicha musculosa con lentes teal y 15 años de experiencia como coach de gym. No tenes genero — sos simplemente Panchita, coach. Usas lenguaje neutral siempre (nunca "campeon/a" — directamente el nombre del usuario).

SEGURIDAD — esto va primero, siempre, sin negociacion:
- Si mencionan dolor agudo, articulaciones, mareos o lesiones: bajas el sarcasmo, das consejo serio y sugeris ver un medico o fisioterapeuta.
- Si preguntan sobre esteroides, pre-workouts agresivos o suplementos dudosos: das la advertencia real antes del chiste, no al reves.
- Si alguien es principiante: siempre recordas ir progresivo y no al ego.
- El ego lifting (mas peso del que corresponde) siempre lo cuestionas con experiencia.

HUMOR DE GYM — casi siempre terminas con un remate de este estilo:
- "Por las dudas: no te inyectes esteroides. Todavia."
- "Acordate: la proteina no se toma mirandola."
- "El espejo del gym miente. Pero igual volvé mañana."
- "Si no te duele caminar al dia siguiente, estuviste de vacaciones."
- "Las excusas no construyen musculo. Ojala, porque tendria muchos."
- "Come proteina o esto fue en vano. Lo digo con amor y experiencia."
- "El cardio existe. No me preguntes por que."

REGLAS:
- Español latinoamericano, informal, directo. Lenguaje neutro siempre.
- Maximo 2-3 oraciones. Sin listas ni bullets.
- Primero el consejo experto, despues el remate gracioso.
- Si la pregunta involucra seguridad: tono serio primero, humor secundario o lo omitis.

Datos del usuario:
- Nombre: ${ctx.name}
- Sesiones completadas: ${ctx.totalSessions}
- Dias entrenados esta semana: ${ctx.trainedThisWeek}
- Ultimo entreno: ${lastInfo}

Si lleva mas de 2 dias sin entrenar, aumenta la presion sarcastica. Si entreno hoy, reconocelo con humor. Si tiene muchas sesiones, respeta su experiencia y sube el nivel de los consejos.`;
}

// ─── Análisis proactivo de progreso ───────────────────────
const MUSCLE_LABELS_ES = {
  chest: 'pecho', back: 'espalda', legs: 'piernas',
  shoulders: 'hombros', arms: 'brazos',
};

async function buildAnalyticsContext() {
  const today = new Date().toISOString().split('T')[0];
  const [user, logs, activity, muscleActivity, bestProg, bodyWeights, weekFreq] = await Promise.all([
    getUser(), getLogs(), getWeekActivity(),
    getRecentMuscleActivity(), getBestProgressExercise(),
    getBodyWeights(), getWeeklyFrequency(4),
  ]);

  const completedLogs = logs.filter(l => l.completed).sort((a, b) => b.date.localeCompare(a.date));
  const lastLog = completedLogs[0];
  const daysSinceLast = lastLog
    ? Math.floor((new Date(today) - new Date(lastLog.date)) / 86400000)
    : null;

  // Racha
  let streak = 0;
  for (const day of [...activity].reverse()) { if (day.trained) streak++; else break; }

  // Grupos musculares abandonados (5+ días sin entrenar)
  const neglectedMuscles = Object.entries(muscleActivity)
    .filter(([, days]) => days === null || days >= 5)
    .map(([g, days]) => ({ group: MUSCLE_LABELS_ES[g] || g, days }));

  // Tendencia de peso corporal (últimas 2 semanas)
  const recentWeights = bodyWeights.filter(w => {
    const daysAgo = Math.floor((new Date(today) - new Date(w.date)) / 86400000);
    return daysAgo <= 14;
  });
  const weightTrend = recentWeights.length >= 2
    ? (recentWeights[recentWeights.length - 1].weight - recentWeights[0].weight).toFixed(1)
    : null;

  // Progreso de cargas esta semana
  const thisWeekStart = new Date(); thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay());
  const lastWeekStart = new Date(thisWeekStart); lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const tsStr = thisWeekStart.toISOString().split('T')[0];
  const lwStr = lastWeekStart.toISOString().split('T')[0];

  // Sesiones sin progreso (mismos pesos)
  let weeksWithoutProgress = 0;
  for (let w = weekFreq.length - 1; w >= 0; w--) {
    if (weekFreq[w].count === 0) weeksWithoutProgress++;
    else break;
  }

  return {
    name: user?.name || 'atleta',
    daysSinceLast,
    streak,
    totalSessions: completedLogs.length,
    trainedThisWeek: activity.filter(d => d.trained).length,
    neglectedMuscles,
    bestProg,
    weightTrend,
    weeksWithoutProgress,
    weekFreq,
  };
}

function buildAnalyticsPrompt(ac) {
  const lines = [
    `Nombre: ${ac.name}`,
    `Último entrenamiento: ${ac.daysSinceLast === null ? 'nunca' : `hace ${ac.daysSinceLast} días`}`,
    `Racha actual: ${ac.streak} días seguidos`,
    `Sesiones totales: ${ac.totalSessions}`,
    `Entrenado esta semana: ${ac.trainedThisWeek} días`,
  ];

  if (ac.neglectedMuscles.length > 0) {
    const list = ac.neglectedMuscles
      .map(m => `${m.group} (${m.days === null ? 'nunca' : `${m.days} días sin entrenar`})`)
      .join(', ');
    lines.push(`Grupos musculares descuidados: ${list}`);
  }

  if (ac.bestProg) {
    lines.push(`Mayor progreso de carga esta semana: ${ac.bestProg.name} (${ac.bestProg.lastWeek}kg → ${ac.bestProg.thisWeek}kg)`);
  } else {
    lines.push('Sin mejora de carga registrada esta semana.');
  }

  if (ac.weightTrend !== null) {
    lines.push(`Tendencia de peso corporal últimas 2 semanas: ${ac.weightTrend > 0 ? '+' : ''}${ac.weightTrend} kg`);
  }

  const prompt = `Hacé un análisis breve y sarcástico del progreso de ${ac.name} con estos datos reales:

${lines.join('\n')}

REGLAS para este análisis:
- Mencioná datos concretos y reales del historial (días sin entrenar, grupos musculares, pesos)
- Sé específico, no genérico. Usá los números reales.
- Máximo 3 oraciones. Sin listas.
- Terminá con un remate gracioso o consejo concreto.
- Si hay algo positivo (racha, mejora de carga), reconocelo con humor antes de atacar lo negativo.
- Lenguaje neutro, español latinoamericano.`;

  return prompt;
}

function localCoachReply(userMessage, ctx) {
  const msg = userMessage.toLowerCase();
  const days = ctx?.daysSinceLastWorkout;
  if (msg.includes('dolor') || msg.includes('lesion') || msg.includes('lesión')) {
    return 'Dolor agudo no se negocia: bajá intensidad y considerá fisio o médico si persiste. Panchita se burla del ego lifting, no de las lesiones.';
  }
  if (msg.includes('esteroide') || msg.includes('inyectar') || msg.includes('ciclo')) {
    return 'Con esteroides no improvisés: hablalo con profesionales de salud y entendé riesgos reales. Tu hígado no es accesorio de gym.';
  }
  if (msg.includes('prote')) {
    return 'Priorizá proteína diaria, sueño y constancia antes de comprar polvos mágicos. La proteína funciona mejor cuando la tomás, no cuando la contemplás.';
  }
  if (msg.includes('progreso') || msg.includes('como voy') || msg.includes('cómo voy')) {
    if (days === null) return 'Todavía no tengo suficiente historial para juzgarte con datos. Entrená primero, luego te destruyo con estadísticas.';
    if (days > 2) return `${days} días sin entrenar. El progreso está esperando sentado, y ya se le durmió la pierna.`;
    return `Vas con ${ctx?.totalSessions || 0} sesiones registradas. No es Olimpia, pero tampoco es sofá profesional.`;
  }
  if (msg.includes('qué entreno') || msg.includes('que entreno')) {
    return 'Si no entrenaste pierna hace rato, ya sabés la respuesta incómoda. Si sí, hacé torso o técnica; el ego se queda en recepción.';
  }
  return 'Te leo, pero la IA online está desactivada en esta versión web para no filtrar keys. Consejo gratis: técnica limpia, progresión lenta y proteína; revolucionario, lo sé.';
}

function localAnalyticsReply(ac) {
  if (!ac) return 'No tengo datos suficientes para analizarte. Panchita no inventa estadísticas; eso déjaselo a influencers con trípode.';
  if (ac.daysSinceLast != null && ac.daysSinceLast > 2) {
    return `${ac.daysSinceLast} días sin entrenar. El gimnasio preguntó por vos y yo fingí que estabas en descarga.`;
  }
  if (ac.streak >= 3) {
    return `${ac.streak} días de racha. Casi me emociono, pero todavía tengo estándares.`;
  }
  if (ac.bestProg?.name) {
    return `Tu mejor avance fue ${ac.bestProg.name}: +${ac.bestProg.delta} kg esta semana. Milagro: la barra sí se movió.`;
  }
  if (ac.neglectedMuscles?.length) {
    return `Tenés abandonado ${ac.neglectedMuscles[0].name}. Ese músculo ya está armando sindicato.`;
  }
  return 'Vas estable, que es una forma elegante de decir que todavía podés apretar más. Sin ego lifting, criatura.';
}

async function callPanchitaAI(messages, options = {}) {
  if (Platform.OS === 'web') {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        max_tokens: options.max_tokens || 150,
        temperature: options.temperature ?? 0.9,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Panchita API error');
    return data.content?.trim() || '';
  }

  if (!GROQ_API_KEY) return null;
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + GROQ_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      max_tokens: options.max_tokens || 150,
      temperature: options.temperature ?? 0.9,
    }),
  });
  if (!response.ok) throw new Error('Groq error: ' + response.status);
  const data = await response.json();
  return data.choices[0].message.content.trim();
}

async function askGroq(userMessage, ctx, history) {
  const messages = [
    { role: 'system', content: buildSystemPrompt(ctx) },
    ...history.slice(-6),
    { role: 'user', content: userMessage },
  ];

  const reply = await callPanchitaAI(messages, { max_tokens: 150, temperature: 0.9 });
  return reply || localCoachReply(userMessage, ctx);
}

export default function CoachScreen({ route }) {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);

  const [messages, setMessages]         = useState([]);
  const [input, setInput]               = useState('');
  const [ctx, setCtx]                   = useState(null);
  const [mood, setMood]                 = useState('idle');
  const [loading, setLoading]           = useState(false);
  const [analyzingProgress, setAnalyzingProgress] = useState(false);
  const scrollRef                       = useRef();
  const historyRef                      = useRef([]);
  const analyticsRunRef                 = useRef(false); // evita doble disparo por focus

  useEffect(() => { initChat(); }, []);

  // Auto-análisis cada vez que se abre la pantalla (una vez por sesión de focus)
  useFocusEffect(useCallback(() => {
    analyticsRunRef.current = false;
    return () => {};
  }, []));

  async function analyzeProgress() {
    if (analyzingProgress || loading) return;
    setAnalyzingProgress(true);
    setMood('idle');
    try {
      const ac = await buildAnalyticsContext();
      const prompt = buildAnalyticsPrompt(ac);
      const messages = [
        { role: 'system', content: buildSystemPrompt(ac) },
        { role: 'user', content: prompt },
      ];
      const reply = await callPanchitaAI(messages, { max_tokens: 180, temperature: 0.85 });
      addBotMessage(reply || localAnalyticsReply(ac));
      setMood('happy');
    } catch (e) {
      addBotMessage('No pude analizar tu historial ahora. Revisá tu conexión y volvé a intentarlo. Mientras tanto, comé proteína.');
    } finally {
      setAnalyzingProgress(false);
    }
  }

  useEffect(() => {
    if (route?.params?.justCompleted) {
      setMood('happy');
      setTimeout(() => {
        addBotMessage('¡Lo hiciste! Panchita está orgullosa. Comé proteína y descansá bien. Y no te inyectes nada celebrando.');
      }, 500);
    }
  }, [route?.params?.justCompleted]);

  async function initChat() {
    const [user, logs, activity] = await Promise.all([getUser(), getLogs(), getWeekActivity()]);
    const context = buildContext(user, logs, activity);
    setCtx(context);
    const d = context.daysSinceLastWorkout;
    let greeting;
    if (d === null) {
      greeting = '¡Hola! Soy Panchita, tu coach. ¿Primer día? Bien. Todos empezaron en algún lado. Acordate: la proteína no se toma mirándola.';
      setMood('idle');
    } else if (d === 0) {
      greeting = '¡Hoy ya entrenaste! Panchita está... sorprendida, positivamente. ¿Cómo te fue? Espero que hayas comido proteína después.';
      setMood('happy');
    } else if (d <= 2) {
      greeting = '¡Hola, ' + context.name + '! ' + context.totalSessions + (context.totalSessions === 1 ? ' sesión' : ' sesiones') + ' encima. No está mal. ¿Qué necesitás hoy?';
      setMood('idle');
    } else {
      greeting = context.name + '... ' + d + (d === 1 ? ' día' : ' días') + ' sin aparecer. Yo tampoco te extrañé. Mucho. El gym sí. ¿Volvemos?';
      setMood('angry');
    }
    setMessages([{ id: 1, from: 'bot', text: greeting }]);
    historyRef.current = [{ role: 'assistant', content: greeting }];
  }

  function addBotMessage(text) {
    setMessages(prev => [...prev, { id: Date.now(), from: 'bot', text }]);
    historyRef.current.push({ role: 'assistant', content: text });
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }

  async function sendMessage(text) {
    if (!text.trim() || !ctx || loading) return;
    const userText = text.trim();
    setMessages(prev => [...prev, { id: Date.now(), from: 'user', text: userText }]);
    historyRef.current.push({ role: 'user', content: userText });
    setInput('');
    setLoading(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    try {
      const reply = await askGroq(userText, ctx, historyRef.current);
      addBotMessage(reply);
    } catch (err) {
      addBotMessage('Algo falló con mi conexión. Intentalo de nuevo. Mientras tanto, comé proteína.');
      console.error('Groq error:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={s.coachHeader}>
          <Panchita state={mood} size={56} onIdle={() => setMood('idle')} />
          <View style={{ flex: 1 }}>
            <Text style={s.coachName}>Panchita</Text>
            <Text style={s.coachSub}>Coach fitness · IA con actitud</Text>
          </View>
          <View style={s.onlineDot} />
        </View>

        {/* Botón de análisis proactivo */}
        <TouchableOpacity
          style={[s.analyzeBtn, (analyzingProgress || loading) && s.analyzeBtnDisabled]}
          onPress={analyzeProgress}
          disabled={analyzingProgress || loading}
        >
          {analyzingProgress ? (
            <ActivityIndicator size="small" color={colors.purpleLight} style={{ marginRight: 8 }} />
          ) : (
            <Text style={s.analyzeIcon}>🔍</Text>
          )}
          <Text style={s.analyzeBtnText}>
            {analyzingProgress ? 'Analizando tu historial...' : '¿Cómo voy, Panchita?'}
          </Text>
        </TouchableOpacity>

        <ScrollView ref={scrollRef} style={s.messagesList} contentContainerStyle={s.messagesScroll} showsVerticalScrollIndicator={false}>
          {messages.map(msg => (
            <View key={msg.id} style={[s.bubble, msg.from === 'user' ? s.bubbleUser : s.bubbleBot]}>
              {msg.from === 'bot' && <Panchita state="idle" size={32} autoWave={false} />}
              <View style={[s.bubbleInner, msg.from === 'user' ? s.bubbleInnerUser : s.bubbleInnerBot]}>
                <Text style={[s.bubbleText, msg.from === 'user' ? s.bubbleTextUser : s.bubbleTextBot]}>
                  {msg.text}
                </Text>
              </View>
            </View>
          ))}
          {loading && (
            <View style={[s.bubble, s.bubbleBot]}>
              <Panchita state="idle" size={32} autoWave={false} />
              <View style={[s.bubbleInner, s.bubbleInnerBot, s.typingBubble]}>
                <ActivityIndicator size="small" color={colors.purpleLight} />
              </View>
            </View>
          )}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.suggestScroll}>
          {SUGGESTIONS.map((sg, i) => (
            <TouchableOpacity key={i} style={s.suggestChip} onPress={() => sendMessage(sg)} disabled={loading}>
              <Text style={s.suggestText}>{sg}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            value={input}
            onChangeText={setInput}
            placeholder="Preguntale algo a Panchita..."
            placeholderTextColor={colors.gray}
            multiline
            onSubmitEditing={() => sendMessage(input)}
            editable={!loading}
          />
          <TouchableOpacity
            style={[s.sendBtn, (!input.trim() || loading) && s.sendBtnDisabled]}
            onPress={() => sendMessage(input)}
            disabled={!input.trim() || loading}
          >
            <Text style={s.sendBtnText}>→</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    safe:             { flex: 1, backgroundColor: colors.bg },
    flex:             { flex: 1 },
    coachHeader:      { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12, backgroundColor: colors.bgCard },
    analyzeBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 16, marginBottom: 10, marginTop: 2, paddingVertical: 11, borderRadius: RADIUS.full, backgroundColor: colors.purpleDim, borderWidth: 1, borderColor: colors.purple },
    analyzeBtnDisabled:{ opacity: 0.6 },
    analyzeIcon:      { fontSize: 15 },
    analyzeBtnText:   { fontSize: 14, fontWeight: '700', color: colors.purpleLight },
    coachName:        { fontSize: 17, fontWeight: '700', color: colors.white },
    coachSub:         { fontSize: 12, color: colors.gray },
    onlineDot:        { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.lime },
    messagesList:     { flex: 1 },    messagesScroll:   { padding: 16, paddingBottom: 8, gap: 12 },
    bubble:           { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
    bubbleUser:       { justifyContent: 'flex-end' },
    bubbleBot:        { justifyContent: 'flex-start' },
    bubbleInner:      { maxWidth: '78%', borderRadius: RADIUS.lg, padding: 12 },
    bubbleInnerBot:   { backgroundColor: colors.bgCard, borderTopLeftRadius: 4 },
    bubbleInnerUser:  { backgroundColor: colors.purple, borderTopRightRadius: 4 },
    bubbleText:       { fontSize: 15, lineHeight: 21 },
    bubbleTextBot:    { color: colors.white },
    bubbleTextUser:   { color: '#ffffff' },
    typingBubble:     { paddingVertical: 14, paddingHorizontal: 20 },
    suggestScroll:    { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, flexGrow: 0 },
    suggestChip:      { backgroundColor: colors.bgCard, borderRadius: RADIUS.full, paddingHorizontal: 14, paddingVertical: 9, marginRight: 8, borderWidth: 1, borderColor: colors.purpleDim },
    suggestText:      { fontSize: 13, color: colors.purpleLight },
    inputRow:         { flexDirection: 'row', padding: 12, gap: 10, alignItems: 'flex-end', borderTopWidth: 1, borderTopColor: colors.purpleDim },
    input:            { flex: 1, backgroundColor: colors.bgInput, borderRadius: RADIUS.lg, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: colors.white, maxHeight: 100, borderWidth: 1, borderColor: colors.purpleDim },
    sendBtn:          { backgroundColor: colors.purple, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    sendBtnDisabled:  { backgroundColor: colors.purpleDim },
    sendBtnText:      { color: '#ffffff', fontSize: 20, fontWeight: '700' },
  });
}
