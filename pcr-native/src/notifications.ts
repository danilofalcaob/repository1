/**
 * Notificações de "Código Azul" como ALARME CRÍTICO.
 *
 * É aqui que está o ganho do app nativo sobre o PWA: tocar alto mesmo com o
 * telefone bloqueado / no silencioso.
 *  - Android: canal de notificação de alta importância, som de alarme em loop,
 *    full-screen intent e bypass do "Não perturbe".
 *  - iOS: Critical Alerts (exige entitlement aprovado pela Apple) com volume
 *    próprio e interruptionLevel 'critical'.
 *
 * Usa @notifee/react-native + @react-native-firebase/messaging.
 */
import notifee, {
  AndroidImportance,
  AndroidCategory,
  AndroidVisibility,
  AuthorizationStatus,
  EventType,
} from '@notifee/react-native';
import messaging, {
  FirebaseMessagingTypes,
} from '@react-native-firebase/messaging';

const CHANNEL_ID = 'codigo-azul';

/** Cria o canal Android de alarme (idempotente). Chamar no boot. */
export async function ensureChannel(): Promise<void> {
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Código Azul',
    importance: AndroidImportance.HIGH,
    sound: 'alarm', // android/app/src/main/res/raw/alarm.mp3
    vibration: true,
    vibrationPattern: [300, 500, 300, 500],
    bypassDnd: true,
    visibility: AndroidVisibility.PUBLIC,
  });
}

/** Solicita permissões, incluindo Critical Alerts no iOS. */
export async function requestPermissions(): Promise<boolean> {
  const settings = await notifee.requestPermission({
    criticalAlert: true,
    alert: true,
    sound: true,
    badge: true,
  });
  // FCM (iOS) — registra para APNs
  await messaging().requestPermission({ criticalAlert: true });
  return settings.authorizationStatus >= AuthorizationStatus.AUTHORIZED;
}

/** Exibe o Código Azul como alarme em destaque. */
export async function displayCodeBlue(data?: Record<string, string>): Promise<void> {
  await ensureChannel();
  const roles = data && data.roles ? safeParseRoles(data.roles) : [];
  const body =
    (data && data.body ? data.body : 'Acionamento da equipe') +
    (roles.length ? '\n' + roles.join('\n') : '');

  await notifee.displayNotification({
    id: 'codigo-azul',
    title: data?.title || '🔵 CÓDIGO AZUL',
    body,
    android: {
      channelId: CHANNEL_ID,
      importance: AndroidImportance.HIGH,
      category: AndroidCategory.CALL,
      visibility: AndroidVisibility.PUBLIC,
      loopSound: true,
      ongoing: true,
      autoCancel: false,
      fullScreenAction: { id: 'default' },
      pressAction: { id: 'default' },
      vibrationPattern: [300, 500, 300, 500],
    },
    ios: {
      critical: true,
      criticalVolume: 1.0,
      interruptionLevel: 'critical',
      sound: 'alarm.caf',
    },
  });
}

function safeParseRoles(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return raw ? raw.split('\n') : [];
  }
}

/** Para o alarme/notificação. */
export async function stopCodeBlue(): Promise<void> {
  await notifee.cancelNotification('codigo-azul');
  await notifee.stopForegroundService().catch(() => {});
}

/**
 * Registra os handlers. Chamar `registerForegroundHandlers` no App e
 * `registerBackgroundHandlers` em index.js (fora do componente).
 */
export function registerForegroundHandlers(): () => void {
  const unsubMsg = messaging().onMessage(
    async (msg: FirebaseMessagingTypes.RemoteMessage) => {
      await displayCodeBlue(msg.data as Record<string, string>);
    },
  );
  const unsubNotifee = notifee.onForegroundEvent(({ type }) => {
    if (type === EventType.PRESS || type === EventType.DISMISSED) {
      stopCodeBlue();
    }
  });
  return () => {
    unsubMsg();
    unsubNotifee();
  };
}

export function registerBackgroundHandlers(): void {
  messaging().setBackgroundMessageHandler(async (msg) => {
    await displayCodeBlue(msg.data as Record<string, string>);
  });
  notifee.onBackgroundEvent(async ({ type }) => {
    if (type === EventType.PRESS || type === EventType.DISMISSED) {
      await stopCodeBlue();
    }
  });
}

/** Token do dispositivo (FCM) para registrar no servidor. */
export async function getDeviceToken(): Promise<string> {
  await messaging().registerDeviceForRemoteMessages();
  return messaging().getToken();
}
