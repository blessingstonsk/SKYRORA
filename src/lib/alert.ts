// Cross-platform Alert. React Native Web's Alert.alert ignores buttons, so on
// web we fall back to the browser's confirm/alert dialogs.
import { Alert as RNAlert, Platform, type AlertButton } from 'react-native';

function webAlert(title: string, message?: string, buttons?: AlertButton[]) {
  const text = message ? `${title}\n\n${message}` : title;
  const actions = (buttons ?? []).filter((b) => b.style !== 'cancel');
  const cancel = (buttons ?? []).find((b) => b.style === 'cancel');
  if (actions.length === 0) {
    globalThis.alert?.(text);
    return;
  }
  if (actions.length === 1) {
    if (globalThis.confirm?.(text)) actions[0].onPress?.();
    else cancel?.onPress?.();
    return;
  }
  // Several actions (e.g. an options menu): offer each in turn.
  for (const a of actions) {
    if (globalThis.confirm?.(`${title}\n\n${a.text}?`)) {
      a.onPress?.();
      return;
    }
  }
  cancel?.onPress?.();
}

export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[]) {
    if (Platform.OS === 'web') webAlert(title, message, buttons);
    else RNAlert.alert(title, message, buttons);
  },
};
