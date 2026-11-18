import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { Alert } from '@/lib/alert';

import { AvatarPicker, BodyFields, GoalPicker, IdentityFields, PrefsPicker, type ProfileFormValue } from '@/components/profile-form';
import { Button, Card, Field, Header, Loading, Screen, T } from '@/components/ui';
import { api } from '@/data';
import { qk, useMe } from '@/data/hooks';
import { pickImages } from '@/lib/image';
import { toPatches, validateProfile } from '@/lib/profile-validate';
import type { Me } from '@/lib/types';
import { cleanText } from '@/lib/validation';
import { space, useTheme } from '@/theme';

export default function EditProfile() {
  const me = useMe().data;
  if (!me) return <Screen header={<Header title="Edit profile" />}><Loading /></Screen>;
  return <EditProfileForm me={me} />;
}

function EditProfileForm({ me }: { me: Me }) {
  const { c } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const [v, setV] = useState<ProfileFormValue>(() => ({
    full_name: me.profile.full_name ?? '', username: me.profile.username, bio: me.profile.bio ?? '', avatar: me.profile.avatar_url,
    age: me.private.age?.toString() ?? '', gender: me.private.gender, height: me.private.height_cm?.toString() ?? '',
    weight: me.private.weight_kg?.toString() ?? '', goal: me.private.fitness_goal, prefs: me.private.activity_prefs,
  }));
  const [location, setLocation] = useState(me.profile.location_label ?? '');
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false);

  const set = (p: Partial<ProfileFormValue>) => setV({ ...v, ...p });

  const save = async () => {
    const r = validateProfile(v, 'all');
    setErrors(r.errors);
    if (!r.ok) return;
    setBusy(true);
    try {
      const p = toPatches(v);
      if (v.avatar && v.avatar !== me.profile.avatar_url) await api.uploadAvatar(v.avatar);
      await api.updateProfile({ ...p.profile, location_label: cleanText(location, 60) || null });
      await api.updatePrivate(p.private);
      await qc.invalidateQueries({ queryKey: qk.me });
      qc.invalidateQueries({ queryKey: qk.profile(me.profile.id) });
      router.back();
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen header={<Header title="Edit profile" right={<Button title="Save" variant="ghost" size="md" onPress={save} loading={busy} />} />} bottomInset={false}>
        <AvatarPicker name={v.full_name} uri={v.avatar} onPick={async () => { const [u] = await pickImages(1, true); if (u) set({ avatar: u }); }} />
        <Card style={{ gap: space(4) }}>
          <IdentityFields v={v} set={set} errors={errors} />
          <Field label="Bio" value={v.bio} onChangeText={(bio) => set({ bio })} maxLength={280} multiline style={{ minHeight: 80 }} />
          <Field label="Location" value={location} onChangeText={setLocation} maxLength={60} placeholder="City, Country" />
        </Card>
        <T v="h3">Body metrics</T>
        <Card><BodyFields v={v} set={set} errors={errors} /></Card>
        <T v="h3">Fitness goal</T>
        <GoalPicker value={v.goal} onChange={(goal) => set({ goal })} />
        <T v="h3">Activity preferences</T>
        <PrefsPicker value={v.prefs} onChange={(prefs) => set({ prefs })} />
        <View style={{ height: space(2) }} />
        <Button title="Save changes" onPress={save} loading={busy} />
        <T v="small" color={c.faint} center>Your body metrics are private and never shown on your profile.</T>
      </Screen>
    </KeyboardAvoidingView>
  );
}
