import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { Button, Card, Field, Header, Row, Screen, T } from '@/components/ui';
import { api } from '@/data';
import { cleanText, isEmail, passwordProblem } from '@/lib/validation';
import { space, useTheme } from '@/theme';

export default function SignUp() {
  const { c } = useTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    const e = {
      name: cleanText(name, 60).length < 2 ? 'Tell us your name' : null,
      email: isEmail(email) ? null : 'Enter a valid email address',
      password: passwordProblem(password),
      form: null as string | null,
    };
    setErrors(e);
    if (e.name || e.email || e.password) return;
    setBusy(true);
    try {
      const r = await api.signUp(email.trim().toLowerCase(), password, cleanText(name, 60));
      if (r.needsConfirmation) setSent(true);
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Screen header={<Header />}>
        <Card style={{ marginTop: space(8), gap: space(3) }}>
          <T v="h1">Check your inbox</T>
          <T v="body" color={c.muted}>We sent a confirmation link to {email}. Open it on this device to finish creating your account.</T>
          <Link href="/sign-in" replace><T v="h3" color={c.primary}>Back to sign in</T></Link>
        </Card>
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen header={<Header />} bottomInset={false}>
        <View style={{ gap: space(2), marginTop: space(4) }}>
          <T v="h1">Join SKYRO</T>
          <T v="body" color={c.muted}>Set goals, track every session and grow with friends.</T>
        </View>
        <Field label="Full name" value={name} onChangeText={setName} autoComplete="name" textContentType="name" placeholder="Alex Rivera" error={errors.name} />
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" placeholder="you@example.com" error={errors.email} />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" placeholder="At least 8 characters" error={errors.password} hint="8+ characters with letters and numbers" />
        {errors.form ? <T v="small" color={c.danger}>{errors.form}</T> : null}
        <Button title="Create account" onPress={submit} loading={busy} />
        <Button title="Sign up with Google" variant="secondary" icon="logo-google" onPress={() => api.signInWithGoogle().catch((e) => setErrors({ form: String(e?.message ?? e) }))} />
        <T v="small" color={c.faint} center>By continuing you agree to the Terms and Privacy Policy. SKYRO provides fitness tracking, not medical advice.</T>
        <Row style={{ justifyContent: 'center' }} gap={1}>
          <T v="small" color={c.muted}>Already a member?</T>
          <Link href="/sign-in" replace><T v="small" color={c.primary}>Sign in</T></Link>
        </Row>
      </Screen>
    </KeyboardAvoidingView>
  );
}
