// Title / description / photos / privacy fields shared by the summary and edit flows.
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, ScrollView, View } from 'react-native';

import { VISIBILITY_LABEL } from '@/data';
import { pickImages } from '@/lib/image';
import type { Visibility } from '@/lib/types';
import { radius, space, useTheme } from '@/theme';

import { Field, Row, T } from './ui';

const VIS_ICON: Record<Visibility, React.ComponentProps<typeof Ionicons>['name']> = { public: 'earth', followers: 'people', private: 'lock-closed' };

export function VisibilityPicker({ value, onChange }: { value: Visibility; onChange(v: Visibility): void }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <T v="label" color={c.muted}>Who can see this</T>
      <Row gap={2}>
        {(['public', 'followers', 'private'] as Visibility[]).map((v) => {
          const on = v === value;
          return (
            <Pressable key={v} onPress={() => onChange(v)} accessibilityRole="radio" accessibilityState={{ checked: on }}
              style={{ flex: 1, alignItems: 'center', gap: 4, paddingVertical: 12, borderRadius: radius.md, backgroundColor: on ? c.primary + '1A' : c.surface2, borderWidth: 1.5, borderColor: on ? c.primary : 'transparent' }}>
              <Ionicons name={VIS_ICON[v]} size={18} color={on ? c.primary : c.muted} />
              <T v="small" color={on ? c.text : c.muted} style={{ fontWeight: '700' }}>{VISIBILITY_LABEL[v]}</T>
            </Pressable>
          );
        })}
      </Row>
    </View>
  );
}

export function PhotoStrip({ uris, onChange, max = 6 }: { uris: string[]; onChange(u: string[]): void; max?: number }) {
  const { c } = useTheme();
  const add = async () => {
    const picked = await pickImages(max - uris.length);
    if (picked.length) onChange([...uris, ...picked].slice(0, max));
  };
  return (
    <View style={{ gap: 8 }}>
      <T v="label" color={c.muted}>Photos</T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(2) }}>
        {uris.length < max ? (
          <Pressable onPress={add} accessibilityRole="button" accessibilityLabel="Add photos"
            style={{ width: 88, height: 88, borderRadius: radius.md, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.border, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <Ionicons name="camera-outline" size={24} color={c.muted} />
            <T v="small" color={c.muted}>Add</T>
          </Pressable>
        ) : null}
        {uris.map((u) => (
          <View key={u}>
            <Image source={{ uri: u }} style={{ width: 88, height: 88, borderRadius: radius.md }} contentFit="cover" />
            <Pressable onPress={() => onChange(uris.filter((x) => x !== u))} accessibilityLabel="Remove photo"
              style={{ position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: '#000a', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={14} color="#fff" />
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

export function TitleFields({ title, description, onTitle, onDescription }: { title: string; description: string; onTitle(s: string): void; onDescription(s: string): void }) {
  return (
    <>
      <Field label="Title" value={title} onChangeText={onTitle} maxLength={80} />
      <Field label="Description" value={description} onChangeText={onDescription} maxLength={2000} multiline numberOfLines={3} placeholder="How did it feel?" style={{ minHeight: 90 }} />
    </>
  );
}
