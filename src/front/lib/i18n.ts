import { register, init, getLocaleFromNavigator, locale as $locale } from 'svelte-i18n';
import { extStorage } from '../../services/ExtStorage';

// Register locales (lazy loaded)
register('en', () => import('../locales/en.json'));
register('ru', () => import('../locales/ru.json'));

export async function initializeI18n(): Promise<void> {
    const stored = await extStorage.local.get(['locale']);
    const initial = typeof stored.locale === 'string' && stored.locale ? stored.locale : (getLocaleFromNavigator() || 'en').slice(0,2);
    await init({
        fallbackLocale: 'en',
        initialLocale: initial
    });
}

export function setAppLocale(next: string): void {
    $locale.set(next);
    void extStorage.local.set({ locale: next }).catch(() => {});
}


