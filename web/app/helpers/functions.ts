export async function handleFileReader(e: Event): Promise<string> {
	const input = e.target as HTMLInputElement
	const file = input.files?.[0]
	if (!file) return ''
	const reader = new FileReader()
	return new Promise((resolve, reject) => {
		reader.onload = () => {
			const result = reader.result as string
			resolve(result)
		}
		reader.onerror = reject
		reader.readAsDataURL(file)
	})
}
