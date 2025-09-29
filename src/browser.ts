// Build-time constant defined via Vite `define` in each target config

declare const __BROWSER__: 'chrome' | 'firefox';

export function isChrome(): boolean {
    try {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - __BROWSER__ is provided at build-time
        return typeof __BROWSER__ !== 'undefined' && __BROWSER__ === 'chrome';
    } catch {
        return false;
    }
}

export function isFirefox(): boolean {
    try {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - __BROWSER__ is provided at build-time
        return typeof __BROWSER__ !== 'undefined' && __BROWSER__ === 'firefox';
    } catch {
        return false;
    }
}


