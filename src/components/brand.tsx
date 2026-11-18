// SKYRO wordmark and logo mark: an upward chevron "flight path" in the brand gradient.
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { useTheme } from '@/theme';

import { Row, T } from './ui';

export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Defs>
        <LinearGradient id="sk" x1="0" y1="1" x2="1" y2="0">
          <Stop offset="0" stopColor="#2EE6C5" />
          <Stop offset="0.55" stopColor="#4DA3FF" />
          <Stop offset="1" stopColor="#7C6CFF" />
        </LinearGradient>
      </Defs>
      <Path d="M6 34 L20 14 L28 26 L42 8" stroke="url(#sk)" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M34 8 H42 V16" stroke="url(#sk)" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M6 42 H42" stroke="url(#sk)" strokeOpacity={0.35} strokeWidth={4} strokeLinecap="round" />
    </Svg>
  );
}

export function Wordmark({ size = 28 }: { size?: number }) {
  const { c } = useTheme();
  return (
    <Row gap={2}>
      <LogoMark size={size * 1.15} />
      <View>
        <T style={{ fontSize: size, fontWeight: '900', letterSpacing: size * 0.18, color: c.text }}>SKYRO</T>
      </View>
    </Row>
  );
}
