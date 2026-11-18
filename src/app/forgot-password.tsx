import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Field, Header, Screen, T } from '@/components/ui';
import { api } from '@/data';
import { isEmail } from '@/lib/validation';
import { space, useTheme } from '@/theme';

export default function ForgotPassword() {
  const { c } = useTheme();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!isEmail(email)) return setError('Enter a valid email address');
    setBusy(true);
    setError(null);
    try {
      await api.resetPassword(email.trim().toLowerCase());
      setDone(true); // same message whether or not the account exists (no account enumeration)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen header={<Header />}>
      <View style={{ gap: space(2), marginTop: space(4) }}>
        <T v="h1">Reset password</T>
        <T v="body" color={c.muted}>Enter your email and we&apos;ll send you a reset link.</T>
      </View>
      {done ? (
        <Card><T v="body">If an account exists for {email}, a reset link is on its way.</T></Card>
      ) : (
        <>
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" error={error} />
          <Button title="Send reset link" onPress={submit} loading={busy} />
        </>
      )}
    </Screen>
  );
}
