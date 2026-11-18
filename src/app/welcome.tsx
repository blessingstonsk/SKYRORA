import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Alert } from '@/lib/alert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LogoMark } from '@/components/brand';
import { RoutePreview } from '@/components/route-preview';
import { Button, Row, T } from '@/components/ui';
import { api } from '@/data';
import { DEMO_EMAIL, DEMO_PASSWORD, generateTrack } from '@/data/demo-seed';
import { space, useTheme } from '@/theme';

let heroSeed = 7;
const HERO_ROUTE = generateTrack(() => ((heroSeed = (heroSeed * 16807) % 2147483647) / 2147483647), 0, 7000, 3, undefined, 20);

export default function Welcome() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState<'google' | 'demo' | null>(null);

  const google = async () => {
    setBusy('google');
    try { await api.signInWithGoogle(); }
    catch (e) { Alert.alert('Google sign-in', e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };
  const demo = async () => {
    setBusy('demo');
    try { await api.signIn(DEMO_EMAIL, DEMO_PASSWORD); }
    catch (e) { Alert.alert('Demo', e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '62%' }}>
        <RoutePreview points={HERO_ROUTE} height={520} style={{ flex: 1 }} />
        <LinearGradient colors={['transparent', c.bg]} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 240 }} />
      </View>
      <View style={{ flex: 1, justifyContent: 'flex-end', padding: space(6), paddingBottom: insets.bottom + space(6), gap: space(5) }}>
        <View style={{ gap: space(3) }}>
          <LogoMark size={56} />
          <T style={{ fontSize: 44, fontWeight: '900', letterSpacing: 6 }}>SKYRO</T>
          <T v="h2" color={c.muted} style={{ fontWeight: '500', lineHeight: 28 }}>
            Track every move. Rise with your crew.
          </T>
        </View>
        <Row gap={4}>
          {[['navigate', 'GPS tracking'], ['trending-up', 'Progress'], ['people', 'Community']].map(([icon, label]) => (
            <Row key={label} gap={1}>
              <Ionicons name={icon as 'navigate'} size={14} color={c.primary} />
              <T v="small" color={c.muted}>{label}</T>
            </Row>
          ))}
        </Row>
        <View style={{ gap: space(3) }}>
          <Button title="Create account" onPress={() => router.push('/sign-up')} />
          <Button title="Continue with Google" variant="secondary" icon="logo-google" onPress={google} loading={busy === 'google'} />
          <Button title="I already have an account" variant="ghost" onPress={() => router.push('/sign-in')} />
          {api.mode === 'demo' ? (
            <Button title="Explore the demo account" variant="outline" icon="sparkles" onPress={demo} loading={busy === 'demo'} size="md" />
          ) : null}
        </View>
        {api.mode === 'demo' ? (
          <T v="small" color={c.faint} center>Demo mode · data stays on this device. Add Supabase keys to go live.</T>
        ) : null}
      </View>
    </View>
  );
}
