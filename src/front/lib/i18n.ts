import { register, init, getLocaleFromNavigator, locale as $locale } from 'svelte-i18n';
import { storage } from '../../services/Storage';

// Register locales (lazy loaded)
register('en', () => import('../locales/en.json'));
register('ru', () => import('../locales/ru.json'));

export async function initializeI18n(): Promise<void> {
    const stored = await storage.local.get(['locale']);
    const initial = typeof stored.locale === 'string' && stored.locale ? stored.locale : (getLocaleFromNavigator() || 'en').slice(0,2);
    await init({
        fallbackLocale: 'en',
        initialLocale: initial
    });
}

export function setAppLocale(next: string): void {
    $locale.set(next);
    try { storage.local.set({ locale: next }); } catch {}
}


