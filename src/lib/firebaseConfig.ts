/**
 * Public Firebase web-app config of the sahibba-easy-jawi project.
 * These values identify the project and are visible to every visitor of any
 * Firebase web app — they are NOT secrets. Security comes from firestore.rules
 * and the Cloud Functions. Override with VITE_FIREBASE_* for another project.
 * Recommended: restrict the API key to your site's domains (docs/DEPLOY.md §5).
 */
export const PROJECT_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCzyBspM8U8BkcrGkoiTcnEW4-v_60xjrI',
  authDomain: 'sahibba-easy-jawi.firebaseapp.com',
  projectId: 'sahibba-easy-jawi',
  appId: '1:882192336331:web:06a6a548cff617eca9a24e',
} as const;
