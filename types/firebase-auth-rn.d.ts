// `firebase/auth`'s published exports map lists a bare `types` condition
// before its `react-native` branch, so Node's "first matching condition
// wins" resolution makes TypeScript pick the generic web types even with
// `customConditions: ["react-native"]` set (expo/tsconfig.base). At
// runtime Metro resolves the `react-native` condition correctly and
// `getReactNativePersistence` genuinely exists — this augmentation only
// tells the type-checker about it. Known upstream packaging gap in the
// firebase / @firebase/auth exports maps, not specific to this project.
import 'firebase/auth';

declare module 'firebase/auth' {
  export function getReactNativePersistence(storage: unknown): Persistence;
}
