import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { Alert } from '@/lib/alert';

import { AvatarPicker, BodyFields, GoalPicker, IdentityFields, PrefsPicker, type ProfileFormValue } from '@/components/profile-form';
import { Button, ProgressBar, Row, Screen, T } from '@/components/ui';
import { api } from '@/data';
import { qk, useMe } from '@/data/hooks';
import { dayKey } from '@/lib/format';
import { pickImages } from '@/lib/image';
import { toPatches, validateProfile } from '@/lib/profile-validate';
import { space, useTheme } from '@/theme';

const STEPS = ['About you', 'Body metrics', 'Your goal', 'What you love'] as const;

export default function Onboarding() {
  const { c } = useTheme();
  const qc = useQueryClient();
  const me = useMe().data;
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [v, setV] = useState<ProfileFormValue>({
    full_name: me?.profile.full_name ?? '', username: me?.profile.username ?? '', bio: '', avatar: me?.profile.avatar_url ?? null,
    age: '', gender: null, height: '', weight: '', goal: null, prefs: ['run', 'walk'],
  });
  const set = (p: Partial<ProfileFormValue>) => setV((x) => ({ ...x, ...p }));

  const next = async () => {
    if (step === 0 || step === 1) {
      const r = validateProfile(v, step === 0 ? 'identity' : 'body');
      setErrors(r.errors);
      if (!r.ok) return;
    }
    if (step < STEPS.length - 1) return setStep(step + 1);
    setBusy(true);
    try {
      const p = toPatches(v);
      if (v.avatar && v.avatar !== me?.profile.avatar_url) await api.uploadAvatar(v.avatar);
      await api.updatePrivate(p.private);
      if (p.private.weight_kg) await api.addWeight(p.private.weight_kg, dayKey(new Date()));
      if (v.goal === 'lose_weight' && p.private.weight_kg) {
        await api.createGoal({ type: 'weight_loss', title: 'Healthy weight goal', target_value: Math.round(p.private.weight_kg * 0.93), start_value: p.private.weight_kg, unit: 'kg', exercise_id: null, deadline: null });
      }
      await api.createGoal({ type: 'weekly_workouts', title: '3 workouts a week', target_value: 3, start_value: null, unit: 'workouts', exercise_id: null, deadline: null });
      await api.updateProfile({ ...p.profile, onboarded: true });
      await qc.invalidateQueries({ queryKey: qk.me });
    } catch (e) {
      Alert.alert('Could not save profile', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const pick = async () => {
    const [uri] = await pickImages(1, true);
    if (uri) set({ avatar: uri });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen bottomInset={false}>
        <View style={{ gap: space(3), marginTop: space(4) }}>
          <T v="label" color={c.primary}>Step {step + 1} of {STEPS.length}</T>
          <ProgressBar pct={((step + 1) / STEPS.length) * 100} height={4} />
          <T v="h1">{STEPS[step]}</T>
        </View>

        {step === 0 && (
          <View style={{ gap: space(4) }}>
            <AvatarPicker name={v.full_name} uri={v.avatar} onPick={pick} />
            <IdentityFields v={v} set={set} errors={errors} />
          </View>
        )}
        {step === 1 && <BodyFields v={v} set={set} errors={errors} />}
        {step === 2 && <GoalPicker value={v.goal} onChange={(goal) => set({ goal })} />}
        {step === 3 && (
          <View style={{ gap: space(3) }}>
            <T v="body" color={c.muted}>Pick the activities you do. You can change this anytime.</T>
            <PrefsPicker value={v.prefs} onChange={(prefs) => set({ prefs })} />
          </View>
        )}

        <Row gap={3} style={{ marginTop: space(4) }}>
          {step > 0 ? <Button title="Back" variant="secondary" onPress={() => setStep(step - 1)} style={{ flex: 1 }} /> : null}
          <Button title={step === STEPS.length - 1 ? "Let's go" : 'Continue'} onPress={next} loading={busy} style={{ flex: 2 }} />
        </Row>
        {step === 1 || step === 2 ? <Button title="Skip for now" variant="ghost" onPress={() => setStep(step + 1)} size="md" /> : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}
