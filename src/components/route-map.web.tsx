// Web build: react-native-maps is native-only, so render the SVG route view.
import type { StyleProp, ViewStyle } from 'react-native';

import { RoutePreview, type LatLng } from './route-preview';

export function RouteMap(props: { polyline?: string | null; points?: LatLng[]; height?: number; style?: StyleProp<ViewStyle>; live?: boolean; rounded?: number }) {
  return <RoutePreview {...props} height={props.height ?? 260} />;
}
