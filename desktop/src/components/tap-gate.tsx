import { useRef } from 'react'
import { toast } from 'sonner'
import { m } from '~/paraglide/messages.js'

const REQUIRED_TAPS = 10
const RESET_AFTER_MS = 1500

/**
 * Gates an action behind a rapid tap/click count, the same "tap N times to unlock" pattern
 * used for hidden developer options. Call `guard(action)` to get a click handler that only
 * runs `action` once it's been clicked `REQUIRED_TAPS` times in a row without pausing too long
 * between clicks; a pause longer than `RESET_AFTER_MS` resets the count.
 */
export function useTapGate() {
	const taps = useRef(0)
	const lastTap = useRef(0)

	function guard(action: () => void) {
		return () => {
			const now = Date.now()
			if (now - lastTap.current > RESET_AFTER_MS) taps.current = 0
			lastTap.current = now
			taps.current += 1

			if (taps.current >= REQUIRED_TAPS) {
				taps.current = 0
				action()
				return
			}

			toast(m.tapsRemaining({ count: String(REQUIRED_TAPS - taps.current) }))
		}
	}

	return { guard }
}
