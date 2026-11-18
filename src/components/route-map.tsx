// Native interactive map (Apple Maps on iOS, Google Maps on Android).
import { useEffect, useMemo, useRef } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { decodePolyline } from '@/lib/geo';
import { useTheme } from '@/theme';

import type { LatLng } from './route-preview';

const DARK_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0b1018' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6b7587' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0b1018' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1a2230' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#08131f' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
];

export function RouteMap({
  polyline, points, height = 260, style, live, rounded = 0,
}: { polyline?: string | null; points?: LatLng[]; height?: number; style?: StyleProp<ViewStyle>; live?: boolean; rounded?: number }) {
  const { c, isDark } = useTheme();
  const ref = useRef<MapView>(null);
  const pts = useMemo(() => points ?? decodePolyline(polyline), [points, polyline]);
  const coords = useMemo(() => pts.map((p) => ({ latitude: p.lat, longitude: p.lng })), [pts]);
  const last = coords[coords.length - 1];

  useEffect(() => {
    if (!coords.length) return;
    if (live) ref.current?.animateCamera({ center: last, zoom: 16 }, { duration: 500 });
    else ref.current?.fitToCoordinates(coords, { edgePadding: { top: 40, bottom: 40, left: 40, right: 40 }, animated: false });
  }, [coords, last, live]);

  return (
    <View style={[{ height, borderRadius: rounded, overflow: 'hidden', backgroundColor: c.map }, style]}>
      <MapView
        ref={ref}
        style={{ flex: 1 }}
        customMapStyle={isDark ? DARK_STYLE : undefined}
        userInterfaceStyle={isDark ? 'dark' : 'light'}
        showsUserLocation={live}
        showsCompass={false}
        toolbarEnabled={false}
        pitchEnabled={false}
        initialRegion={last ? { ...last, latitudeDelta: 0.02, longitudeDelta: 0.02 } : undefined}
        onMapReady={() => coords.length && !live && ref.current?.fitToCoordinates(coords, { edgePadding: { top: 40, bottom: 40, left: 40, right: 40 }, animated: false })}>
        {coords.length > 1 ? <Polyline coordinates={coords} strokeColor={c.primary} strokeWidth={5} lineCap="round" lineJoin="round" /> : null}
        {coords.length && !live ? <Marker coordinate={coords[0]} pinColor={c.success} /> : null}
        {coords.length > 1 && !live ? <Marker coordinate={last} pinColor={c.danger} /> : null}
      </MapView>
    </View>
  );
}
