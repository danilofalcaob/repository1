/**
 * Entry point. Registra os handlers de background ANTES do app montar
 * (exigência do FCM/Notifee) e registra o componente raiz.
 */
import { AppRegistry } from 'react-native';
import { registerBackgroundHandlers } from './src/notifications';
import App from './App';
import { name as appName } from './app.json';

registerBackgroundHandlers();

AppRegistry.registerComponent(appName, () => App);
