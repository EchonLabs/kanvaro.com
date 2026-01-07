const FALLBACK_TIMEZONE = 'UTC'

export const detectClientTimezone = (): string => {
	if (typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function') {
		try {
			const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone
			if (resolved && typeof resolved === 'string') {
				console.log('Detected client timezone:', resolved)
				return resolved
			}
		} catch (error) {
			console.warn('Failed to detect client timezone:', error)
		}
	}
	return FALLBACK_TIMEZONE
}

const pad = (value: number): string => value.toString().padStart(2, '0')

export const formatAsLocalDateTime = (date: Date): string => {
	return [
		`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
		`${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
	].join('T')
}
