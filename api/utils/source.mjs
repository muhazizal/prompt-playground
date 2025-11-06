// Utilities to merge and dedupe document sources consistently

/**
 * Merge document-like sources by file, prefer richer entries (with snippet/score),
 * sort by score desc, and optionally cap to top N.
 */
export function mergeDocSources({
	docSources = [],
	docExactSources = [],
	docListSources = [],
	normalizedDocStrings = [],
	cap = 10,
}) {
	const pool = [...docExactSources, ...docSources]
	const hasScorableDocs = pool.length > 0
	const docListIncluded = hasScorableDocs ? [] : docListSources
	const candidates = [
		...pool,
		...docListIncluded,
		...normalizedDocStrings.filter((x) => x && x.type === 'doc'),
	]

	const byFile = new Map()
	for (const d of candidates) {
		if (!d || !d.file) continue
		const prev = byFile.get(d.file)
		const prevScore = typeof prev?.score === 'number' ? prev.score : -Infinity
		const curScore = typeof d?.score === 'number' ? d.score : -Infinity
		const prevHasSnippet = !!prev?.snippet
		const curHasSnippet = !!d?.snippet
		const pickCurrent =
			!prev ||
			(!prevHasSnippet && curHasSnippet) ||
			(prevHasSnippet && curHasSnippet && curScore > prevScore) ||
			(!prevHasSnippet && !curHasSnippet && curScore > prevScore)
		if (pickCurrent) byFile.set(d.file, d)
	}

	const merged = Array.from(byFile.values())
	merged.sort((a, b) => Number(b.score || -Infinity) - Number(a.score || -Infinity))
	return merged.slice(0, cap)
}
