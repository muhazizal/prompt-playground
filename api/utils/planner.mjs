/**
 * Heuristic planning: determines whether prompt likely needs weather or docs tools.
 */
export function planTools(prompt) {
	const txt = String(prompt || '').toLowerCase()
	const wantsWeather = /\b(weather|temperature|forecast|rain|sunny|wind)\b/.test(txt)

	return { wantsWeather }
}
