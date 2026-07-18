// Shared dark/light theme. The whole app re-themes by toggling `.dark` on
// <html>; tokens.css supplies both palettes. State lives on an object so the
// reactive value survives module imports (you can't reassign an imported `let`).
import { browser } from '$app/environment';

const KEY = 'atlas-theme';

export const theme = $state<{ mode: 'dark' | 'light' }>({ mode: 'dark' });

function apply(): void {
	if (browser) document.documentElement.classList.toggle('dark', theme.mode === 'dark');
}

/** Read the persisted (or system) preference and apply it. Call once on mount. */
export function initTheme(): void {
	if (!browser) return;
	const stored = localStorage.getItem(KEY);
	theme.mode =
		stored === 'light' || stored === 'dark'
			? stored
			: matchMedia('(prefers-color-scheme: light)').matches
				? 'light'
				: 'dark';
	apply();
}

/** Flip the theme, persist it, and re-apply the class. */
export function toggleTheme(): void {
	theme.mode = theme.mode === 'dark' ? 'light' : 'dark';
	if (browser) localStorage.setItem(KEY, theme.mode);
	apply();
}
