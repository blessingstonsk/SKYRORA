import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { Button, Divider, Field, Header, Row, Screen, T } from '@/components/ui';
import { api } from '@/data';
import { isEmail } from '@/lib/validation';
import { space, useTheme } from '@/theme';

export default function SignIn() {
  const { c } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempts, setAttempts] = useState(0);

  const submit = async () => {
    setError(null);
    if (!isEmail(email)) return setError('Enter a valid email address');
    if (!password) return setError('Enter your password');
    // Client-side backoff after repeated failures (server also rate-limits).
    if (attempts >= 5) return setError('Too many attempts. Please wait a minute and try again.');
    setBusy(true);
    try {
      await api.signIn(email.trim(), password);
    } catch (e) {
      setAttempts((n) => n + 1);
      if (attempts + 1 >= 5) setTimeout(() => setAttempts(0), 60_000);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen header={<Header />} bottomInset={false}>
        <View style={{ gap: space(2), marginTop: space(4) }}>
          <T v="h1">Welcome back</T>
          <T v="body" color={c.muted}>Sign in to keep your streak alive.</T>
        </View>
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" placeholder="you@example.com" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" placeholder="••••••••" onSubmitEditing={submit} />
        {error ? <T v="small" color={c.danger}>{error}</T> : null}
        <Button title="Sign in" onPress={submit} loading={busy} />
        <Link href="/forgot-password" style={{ alignSelf: 'center' }}>
          <T v="small" color={c.primary}>Forgot password?</T>
        </Link>
        <Row style={{ marginVertical: space(2) }}><View style={{ flex: 1 }}><Divider /></View><T v="small" color={c.faint}>or</T><View style={{ flex: 1 }}><Divider /></View></Row>
        <Button title="Continue with Google" variant="secondary" icon="logo-google" onPress={() => api.signInWithGoogle().catch((e) => setError(String(e?.message ?? e)))} />
        <Row style={{ justifyContent: 'center' }} gap={1}>
          <T v="small" color={c.muted}>New to SKYRO?</T>
          <Link href="/sign-up" replace><T v="small" color={c.primary}>Create an account</T></Link>
        </Row>
      </Screen>
    </KeyboardAvoidingView>
  );
}
