/** User theme and locale preferences (D-01: stored in users table). */
export type Theme = 'light' | 'dark' | 'system';
export type Locale = 'de' | 'en';

export interface UserPreferences {
  theme: Theme;
  locale: Locale;
}

/** PATCH /api/me/preferences request body — both fields optional (PATCH semantics). */
export type UpdatePreferencesBody = Partial<UserPreferences>;
