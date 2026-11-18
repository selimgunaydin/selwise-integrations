import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { selwise } from './selwise';

/**
 * Push notifications: the app's part of a Selwise "App push" scenario step.
 *
 * Selwise composes and targets; the push provider you connect in the dashboard
 * (your Firebase project, your Apple team or your Expo account) sends. The
 * app hands Selwise three things — what the OS allows, the device's token, and
 * the tap on a notification — and the SDK keeps the rest of the rules
 * (marketing consent first, the customer following the login).
 */

// A notification that arrives while the app is open is still shown.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

type PushPermission = 'granted' | 'denied' | 'undetermined';

function permissionOf(status: Notifications.NotificationPermissionsStatus): PushPermission {
  if (status.granted) return 'granted';
  return status.canAskAgain ? 'undetermined' : 'denied';
}

/**
 * Registers this phone. An Expo project id (EXPO_PUBLIC_EXPO_PROJECT_ID) means
 * Expo's push service sends; without one the device's own token is used — FCM
 * on Android, APNs on iOS — and the provider you connected for it sends.
 */
async function registerToken(): Promise<void> {
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const projectId = process.env.EXPO_PUBLIC_EXPO_PROJECT_ID;
  if (projectId) {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await selwise.registerPushToken({ token: data, provider: 'expo', platform });
    return;
  }
  const { data } = await Notifications.getDevicePushTokenAsync();
  await selwise.registerPushToken({ token: String(data), provider: platform === 'ios' ? 'apns' : 'fcm', platform });
}

/**
 * At every launch: tell Selwise what the OS allows, and register the token when
 * the person already said yes. It never asks — the prompt belongs to a moment
 * the person chose (`enablePush`).
 */
export async function syncPush(): Promise<void> {
  try {
    const status = permissionOf(await Notifications.getPermissionsAsync());
    selwise.setPushPermission(status);
    if (status === 'granted') await registerToken();
  } catch {
    // A simulator or Expo Go has no push token; the app works the same without one.
  }
}

/** The person agreed to notifications (the consent sheet's Marketing switch): ask the OS, then register. */
export async function enablePush(): Promise<void> {
  try {
    const status = permissionOf(await Notifications.requestPermissionsAsync());
    selwise.setPushPermission(status);
    if (status === 'granted') await registerToken();
  } catch {
    // see syncPush
  }
}

/**
 * A new token from the OS is simply registered again, and a tap on a Selwise
 * notification is recorded and opened: `trackPushOpen` returns the link the step
 * points at (`app://basket`, your own deep link, or https) and `null` for a
 * notification Selwise did not send. `open` is the app's own navigation.
 */
export function listenToPush(open: (link: string) => void): () => void {
  const tokens = Notifications.addPushTokenListener(() => void syncPush());
  const taps = Notifications.addNotificationResponseReceivedListener((response) => {
    const link = selwise.trackPushOpen(response);
    if (link) open(link);
  });
  // The tap that launched the app from a closed state.
  void Notifications.getLastNotificationResponseAsync().then((response) => {
    const link = response ? selwise.trackPushOpen(response) : null;
    if (link) open(link);
  });
  return () => {
    tokens.remove();
    taps.remove();
  };
}
