import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';

import { Alert } from '@/lib/alert';

import { GoalRow } from '@/components/goal-row';
import { Button, Card, Chip, Empty, Field, Header, IconButton, Loading, Row, Screen, T } from '@/components/ui';
import { api } from '@/data';
import { qk, useExercises, useGoals, useMyActivities, useWeights } from '@/data/hooks';
import { useDashboard } from '@/hooks/use-dashboard';
import { GOAL_META } from '@/lib/stats';
import type { GoalType } from '@/lib/types';
import { cleanText, numberIn } from '@/lib/validation';
import { radius, space, useTheme } from '@/theme';

const TYPES = Object.keys(GOAL_META) as GoalType[];

export default function Goals() {
  const { c } = useTheme();
  const qc = useQueryClient();
  const goals = useGoals();
  const acts = useMyActivities().data ?? [];
  const weights = useWeights().data ?? [];
  const d = useDashboard();
  const exercises = useExercises().data ?? [];
  const latest = weights.length ? weights[weights.length - 1].weight_kg : null;

  const [type, setType] = useState<GoalType | null>(null);
  const [target, setTarget] = useState('');
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => { setType(null); setTarget(''); setTitle(''); setStart(''); setExerciseId(null); setError(null); };

  const create = async () => {
    if (!type) return;
    const meta = GOAL_META[type];
    const t = numberIn(target, 0.1, 1_000_000);
    if (t == null) return setError('Enter a target');
    if ((type === 'weight_loss' || type === 'weight_gain') && t < 20) return setError('Enter a realistic target weight (kg)');
    if (type === 'weight_loss' && latest && t >= latest) return setError(`Target should be below your current ${latest} kg`);
    if (type === 'weight_gain' && latest && t <= latest) return setError(`Target should be above your current ${latest} kg`);
    if (type === 'strength' && !exerciseId) return setError('Choose an exercise');
    setBusy(true);
    try {
      const exName = exercises.find((e) => e.id === exerciseId)?.name;
      await api.createGoal({
        type, target_value: t, unit: meta.unit, exercise_id: exerciseId, deadline: null,
        start_value: type === 'weight_loss' || type === 'weight_gain' ? latest : type === 'strength' ? numberIn(start, 0, 1000) : null,
        title: cleanText(title, 80) || (type === 'strength' ? `${exName} ${t} kg` : `${meta.label}: ${t.toLocaleString()} ${meta.unit}`),
      });
      await qc.invalidateQueries({ queryKey: qk.goals });
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = (id: string, name: string) =>
    Alert.alert('Remove goal?', name, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { await api.deleteGoal(id); qc.invalidateQueries({ queryKey: qk.goals }); } },
    ]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen header={<Header title="Goals" />} bottomInset={false}>
        {goals.isLoading ? <Loading /> : (goals.data ?? []).length === 0 ? (
          <Empty icon="flag-outline" title="No goals yet" body="Pick a goal below. Small, consistent targets work best." />
        ) : (
          <Card style={{ gap: space(5) }}>
            {(goals.data ?? []).map((g) => (
              <Pressable key={g.id} onLongPress={() => remove(g.id, g.title)}>
                <GoalRow goal={g} acts={acts} weight={latest} steps={d.today.steps} />
              </Pressable>
            ))}
            <T v="small" color={c.faint}>Long-press a goal to remove it.</T>
          </Card>
        )}

        <T v="h2">New goal</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
          {TYPES.map((t) => {
            const on = type === t;
            return (
              <Pressable key={t} onPress={() => { setType(t); setError(null); }} accessibilityRole="radio" accessibilityState={{ checked: on }}
                style={{ width: '48.5%', padding: space(3), borderRadius: radius.lg, gap: 6, backgroundColor: on ? c.primary + '1A' : c.surface, borderWidth: 1.5, borderColor: on ? c.primary : c.border }}>
                <Ionicons name={GOAL_META[t].icon as 'flame'} size={20} color={on ? c.primary : c.muted} />
                <T v="h3">{GOAL_META[t].label}</T>
                <T v="small" color={c.muted}>{GOAL_META[t].hint}</T>
              </Pressable>
            );
          })}
        </View>

        {type ? (
          <Card style={{ gap: space(4) }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T v="h3">{GOAL_META[type].label}</T>
              <IconButton icon="close" label="Cancel" onPress={reset} />
            </Row>
            {type === 'strength' ? (
              <View style={{ gap: 8 }}>
                <T v="label" color={c.muted}>Exercise</T>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(2) }}>
                  {exercises.filter((e) => e.category === 'strength').map((e) => <Chip key={e.id} label={e.name} active={exerciseId === e.id} onPress={() => setExerciseId(e.id)} />)}
                </ScrollView>
                <Field label="Current best (kg)" value={start} onChangeText={setStart} keyboardType="decimal-pad" maxLength={6} />
              </View>
            ) : null}
            {(type === 'weight_loss' || type === 'weight_gain') && latest ? <T v="small" color={c.muted}>Current weight: {latest} kg</T> : null}
            <Field label={`${GOAL_META[type].hint} (${GOAL_META[type].unit})`} value={target} onChangeText={setTarget} keyboardType="decimal-pad" maxLength={8} error={error} />
            <Field label="Name (optional)" value={title} onChangeText={setTitle} maxLength={80} />
            {(type === 'weight_loss' || type === 'weight_gain') ? (
              <T v="small" color={c.faint}>Aim for gradual, sustainable change. For personalised guidance, consult a healthcare professional.</T>
            ) : null}
            <Button title="Create goal" onPress={create} loading={busy} />
          </Card>
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}
