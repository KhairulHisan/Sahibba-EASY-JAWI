/** The app-wide Smart Online Dictionary checker (Single Player only). */
import { FIREBASE_ENABLED } from '../../lib/firebase';
import { lexiconFor } from '../../state/lexicon';
import { useSingle } from '../single/store';
import { persistentCache } from './cacheStore';
import { createChecker, type DictionaryChecker } from './checker';
import { firebaseBackend } from './firebaseBackend';

/** The online dictionary can work in this build (needs Firestore; works on the free plan). */
export const ONLINE_DICTIONARY_AVAILABLE = FIREBASE_ENABLED;

let checker: DictionaryChecker | null = null;

export function dictionaryChecker(): DictionaryChecker {
  checker ??= createChecker({
    backend: firebaseBackend,
    cache: persistentCache,
    isLocal: (key) => lexiconFor(useSingle.getState().packIds).has(key),
  });
  return checker;
}
