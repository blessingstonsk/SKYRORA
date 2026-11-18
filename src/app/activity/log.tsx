// Manual logging: gym/strength sessions (exercises, sets, reps, weight, rest)
// and non-GPS activities (yoga, swim, treadmill etc.).
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';

import { Alert } from '@/lib/alert';

import { VisibilityPicker } from '@/components/activity-editor';
import { Button, Card, Chip, Field, Header, IconButton, Row, Screen, Segmented, T, type MciName } from '@/components/ui';
import { api } from '@/data';
import { invalidateActivityData, qk, useExercises, useMe } from '@/data/hooks';
import { saveDraft } from '@/data/outbox';
import { estimateCalories, strengthCalories } from '@/lib/calories';
import { ACTIVITY_META, autoTitle, uuid } from '@/lib/format';
import type { ActivityType, Exercise, Visibility, WorkoutSet } from '@/lib/types';
import { cleanText, numberIn } from '@/lib/validation';
import { radius, space, useTheme } from '@/theme';

const TYPES: ActivityType[] = ['strength', 'run', 'walk', 'ride', 'yoga', 'swim', 'other'];

interface SetRow { reps: string; weight: string; rest: string; duration: string }
interface Block { exercise: Exercise; sets: SetRow[] }

export default function LogWorkout() {
  const { c } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const me = useMe().data;
  const [type, setType] = useState<ActivityType>('strength');
  const [when, setWhen] = useState<'now' | 'today' | 'yesterday'>('now');
  const [minutes, setMinutes] = useState('45');
  const [distance, setDistance] = useState('');
  const [calories, setCalories] = useState('');
  const [title, setTitle] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);

  const mins = numberIn(minutes, 1, 1440) ?? 0;
  const distKm = numberIn(distance || '0', 0, 1000) ?? 0;
  const estKcal = type === 'strength' ? strengthCalories(mins, me?.private.weight_kg) : estimateCalories(type, mins * 60, distKm * 1000, me?.private.weight_kg);
  const hasDistance = ['run', 'walk', 'ride', 'swim'].includes(type);

  const save = async () => {
    if (!mins) return Alert.alert('Add a duration', 'How long did the session take?');
    const sets: WorkoutSet[] = blocks.flatMap((b, bi) => b.sets.map((s, si) => ({
      exercise_id: b.exercise.id, exercise_name: b.exercise.name, set_index: bi * 100 + si,
      reps: numberIn(s.reps, 0, 1000), weight_kg: numberIn(s.weight, 0, 1000), rest_s: numberIn(s.rest, 0, 3600), duration_s: numberIn(s.duration, 0, 86400),
    })));
    const end = new Date();
    if (when === 'today') end.setHours(Math.max(0, end.getHours() - 2));
    if (when === 'yesterday') { end.setDate(end.getDate() - 1); end.setHours(18, 0, 0, 0); }
    const start = new Date(end.getTime() - mins * 60000);
    const kcal = calories ? numberIn(calories, 0, 10000) ?? estKcal : estKcal;
    setBusy(true);
    try {
      const saved = await saveDraft({
        client_id: uuid(), type, title: cleanText(title, 80) || (type === 'strength' ? 'Strength session' : autoTitle(type, start)),
        description: null, visibility, started_at: start.toISOString(), ended_at: end.toISOString(),
        moving_time_s: mins * 60, elapsed_time_s: mins * 60, distance_m: Math.round(distKm * 1000), elevation_gain_m: 0,
        avg_speed_mps: distKm ? (distKm * 1000) / (mins * 60) : null, max_speed_mps: null,
        avg_pace_s_km: distKm ? (mins * 60) / distKm : null, calories: kcal, steps: null, avg_hr: null, max_hr: null,
        points: [], splits: [], best_efforts: {}, photo_uris: [], sets,
      });
      await invalidateActivityData(qc);
      if (saved) router.replace(`/activity/${saved.id}`);
      else { router.back(); Alert.alert('Saved offline', 'Will sync when you are back online.'); }
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const updateSet = (bi: number, si: number, patch: Partial<SetRow>) =>
    setBlocks((bs) => bs.map((b, i) => (i !== bi ? b : { ...b, sets: b.sets.map((s, j) => (j === si ? { ...s, ...patch } : s)) })));

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen header={<Header title="Log workout" />} bottomInset={false}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(2) }}>
          {TYPES.map((t) => <Chip key={t} label={ACTIVITY_META[t].label} icon={ACTIVITY_META[t].icon as MciName} active={type === t} onPress={() => setType(t)} />)}
        </ScrollView>

        <Card style={{ gap: space(4) }}>
          <Field label="Title" value={title} onChangeText={setTitle} placeholder={type === 'strength' ? 'Push Day' : autoTitle(type, new Date())} maxLength={80} />
          <View style={{ gap: 8 }}>
            <T v="label" color={c.muted}>When</T>
            <Segmented options={[{ key: 'now', label: 'Just now' }, { key: 'today', label: 'Earlier today' }, { key: 'yesterday', label: 'Yesterday' }]} value={when} onChange={setWhen} />
          </View>
          <Row gap={3} style={{ alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}><Field label="Duration (min)" value={minutes} onChangeText={setMinutes} keyboardType="number-pad" maxLength={4} /></View>
            {hasDistance ? <View style={{ flex: 1 }}><Field label="Distance (km)" value={distance} onChangeText={setDistance} keyboardType="decimal-pad" maxLength={6} /></View> : null}
            <View style={{ flex: 1 }}><Field label="Calories" value={calories} onChangeText={setCalories} keyboardType="number-pad" placeholder={String(estKcal)} maxLength={5} hint="Estimated" /></View>
          </Row>
        </Card>

        {type === 'strength' ? (
          <>
            {blocks.map((b, bi) => (
              <Card key={b.exercise.id + bi} style={{ gap: space(3) }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <View>
                    <T v="h3">{b.exercise.name}</T>
                    <T v="small" color={c.muted}>{b.exercise.muscle_group ?? b.exercise.category}</T>
                  </View>
                  <IconButton icon="trash-outline" label="Remove exercise" onPress={() => setBlocks(blocks.filter((_, i) => i !== bi))} />
                </Row>
                <Row gap={2}>
                  <T v="label" color={c.faint} style={{ width: 28 }}>Set</T>
                  {['Reps', 'Kg', 'Rest s'].map((h) => <T key={h} v="label" color={c.faint} style={{ flex: 1, textAlign: 'center' }}>{h}</T>)}
                </Row>
                {b.sets.map((s, si) => (
                  <Row key={si} gap={2}>
                    <T v="h3" color={c.muted} style={{ width: 28 }}>{si + 1}</T>
                    <Cell value={s.reps} onChange={(reps) => updateSet(bi, si, { reps })} />
                    <Cell value={s.weight} onChange={(weight) => updateSet(bi, si, { weight })} decimal />
                    <Cell value={s.rest} onChange={(rest) => updateSet(bi, si, { rest })} />
                  </Row>
                ))}
                <Button title="Add set" icon="add" variant="secondary" size="md"
                  onPress={() => setBlocks(blocks.map((x, i) => (i === bi ? { ...x, sets: [...x.sets, { ...(x.sets[x.sets.length - 1] ?? { reps: '10', weight: '', rest: '90', duration: '' }) }] } : x)))} />
              </Card>
            ))}
            <Button title="Add exercise" icon="barbell-outline" variant="outline" onPress={() => setPicker(true)} />
          </>
        ) : null}

        <VisibilityPicker value={visibility} onChange={setVisibility} />
        <Button title="Save workout" icon="checkmark" onPress={save} loading={busy} />
      </Screen>
      <ExercisePicker visible={picker} onClose={() => setPicker(false)} onPick={(e) => { setBlocks([...blocks, { exercise: e, sets: [{ reps: '10', weight: '', rest: '90', duration: '' }] }]); setPicker(false); }} />
    </KeyboardAvoidingView>
  );
}

function Cell({ value, onChange, decimal }: { value: string; onChange(s: string): void; decimal?: boolean }) {
  const { c } = useTheme();
  return (
    <TextInput value={value} onChangeText={onChange} keyboardType={decimal ? 'decimal-pad' : 'number-pad'} maxLength={6} selectTextOnFocus
      style={[{ flex: 1, height: 44, borderRadius: radius.sm, backgroundColor: c.surface2, color: c.text, textAlign: 'center', fontSize: 16, fontWeight: '700' }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]} />
  );
}

function ExercisePicker({ visible, onClose, onPick }: { visible: boolean; onClose(): void; onPick(e: Exercise): void }) {
  const { c } = useTheme();
  const qc = useQueryClient();
  const listQ = useExercises().data;
  const list = useMemo(() => listQ ?? [], [listQ]);
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [muscle, setMuscle] = useState('');
  const filtered = useMemo(() => list.filter((e) => e.name.toLowerCase().includes(q.toLowerCase())), [list, q]);

  const create = async () => {
    const name = cleanText(q, 60);
    if (name.length < 2) return;
    try {
      const e = await api.createExercise(name, 'strength', cleanText(muscle, 30) || null);
      await qc.invalidateQueries({ queryKey: qk.exercises });
      setCreating(false);
      setQ('');
      onPick(e);
    } catch (err) {
      Alert.alert('Could not create exercise', err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: c.bg, padding: space(4), gap: space(3) }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T v="h2">Choose exercise</T>
          <IconButton icon="close" label="Close" onPress={onClose} />
        </Row>
        <Field value={q} onChangeText={setQ} placeholder="Search or name a new exercise" autoFocus />
        {creating ? (
          <Card style={{ gap: space(3) }}>
            <T v="h3">New exercise: {q}</T>
            <Field label="Muscle group (optional)" value={muscle} onChangeText={setMuscle} placeholder="e.g. Shoulders" />
            <Button title="Create" onPress={create} size="md" />
          </Card>
        ) : q.length >= 2 && !list.some((e) => e.name.toLowerCase() === q.toLowerCase()) ? (
          <Button title={`Create “${q}”`} icon="add-circle-outline" variant="secondary" onPress={() => setCreating(true)} size="md" />
        ) : null}
        <ScrollView contentContainerStyle={{ gap: 2, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {filtered.map((e) => (
            <Pressable key={e.id} onPress={() => onPick(e)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space(3), padding: space(3), borderRadius: radius.md, backgroundColor: pressed ? c.surface2 : 'transparent' })}>
              <Ionicons name={e.category === 'core' ? 'body-outline' : 'barbell-outline'} size={20} color={c.primary} />
              <View style={{ flex: 1 }}>
                <T v="h3" style={{ fontWeight: '600' }}>{e.name}</T>
                <T v="small" color={c.muted}>{e.muscle_group ?? e.category}{e.is_custom ? ' · custom' : ''}</T>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}
