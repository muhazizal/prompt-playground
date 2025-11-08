// temperatureOptions are the available temperature options for a prompt run.
export const temperatureOptions = [
	{ label: '0.1', value: 0.1 },
	{ label: '0.20', value: 0.2 },
	{ label: '0.30', value: 0.3 },
	{ label: '0.40', value: 0.4 },
	{ label: '0.50', value: 0.5 },
	{ label: '0.60', value: 0.6 },
	{ label: '0.70', value: 0.7 },
	{ label: '0.80', value: 0.8 },
	{ label: '0.90', value: 0.9 },
	{ label: '1.00', value: 1 },
]

// modelOptions are the available models options for a prompt run.
export const modelOptions = [{ label: 'gpt-4o-mini', value: 'gpt-4o-mini' }]

// docsOptions are the available documents options for a prompt run.
// Each option is a week of the course.
export const docsOptions = [
	{ label: 'Phase 1 Week 1', value: 'phase-1-week-1' },
	{ label: 'Phase 1 Week 2', value: 'phase-1-week-2' },
	{ label: 'Phase 1 Week 3', value: 'phase-1-week-3' },
	{ label: 'Phase 2 Week 1', value: 'phase-2-week-1' },
	{ label: 'Phase 2 Week 2', value: 'phase-2-week-2' },
	{ label: 'Phase 2 Week 3', value: 'phase-2-week-3' },
	{ label: 'Phase 2 Week 4', value: 'phase-2-week-4' },
]

// Available voices for TTS selection
export const VOICE_OPTIONS = [
	'alloy',
	'echo',
	'fable',
	'onyx',
	'nova',
	'shimmer',
	'coral',
	'verse',
	'ballad',
	'ash',
	'sage',
	'marin',
	'cedar',
]
