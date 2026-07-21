import { ReactNode, createContext, useCallback, useContext, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

export type DisplayLockStatus = 'unpaired' | 'matched' | 'mismatched' | 'detectionFailed'

interface DisplayLockContextType {
	status: DisplayLockStatus | null
	refresh: () => Promise<void>
}

const DisplayLockContext = createContext<DisplayLockContextType>({
	status: null,
	refresh: async () => {},
})

export function useDisplayLock() {
	return useContext(DisplayLockContext)
}

export function DisplayLockProvider({ children }: { children: ReactNode }) {
	const [status, setStatus] = useState<DisplayLockStatus | null>(null)

	const refresh = useCallback(async () => {
		try {
			const result = await invoke<DisplayLockStatus>('display_lock_status')
			setStatus(result)
		} catch (error) {
			console.error('failed to read display lock status:', error)
			// Fail open: if the status check itself is broken, don't block the app.
			setStatus('detectionFailed')
		}
	}, [])

	useEffect(() => {
		refresh()
	}, [refresh])

	return <DisplayLockContext.Provider value={{ status, refresh }}>{children}</DisplayLockContext.Provider>
}
