import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { m } from '~/paraglide/messages.js'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Lock } from 'lucide-react'
import { useDisplayLock } from '~/providers/display-lock'

export function DisplayLockScreen() {
	const { refresh } = useDisplayLock()
	const [password, setPassword] = useState('')
	const [error, setError] = useState<string | null>(null)
	const [submitting, setSubmitting] = useState(false)

	useEffect(() => {
		// The main window may still be hidden while content loads; force it visible so the
		// block screen is never mistaken for a hang.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const currentWindow = (window as any).__TAURI__?.webviewWindow?.getCurrentWebviewWindow?.()
		currentWindow?.show()
		currentWindow?.setFocus()
	}, [])

	async function handleSubmit() {
		setSubmitting(true)
		setError(null)
		try {
			await invoke('display_lock_repair', { password })
			setPassword('')
			await refresh()
		} catch (error) {
			setError(String(error))
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<div className="app-shell flex min-h-screen items-center justify-center">
			<div className="app-panel w-full max-w-md text-center">
				<div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
					<Lock className="h-6 w-6" />
				</div>
				<div className="text-balance text-xl font-semibold md:text-2xl">{m.displayLockBlockedTitle()}</div>
				<p className="mt-3 text-sm text-muted-foreground">{m.displayLockBlockedBody()}</p>

				<div className="mt-6 space-y-2 text-start">
					<Input
						type="password"
						value={password}
						onChange={(event) => setPassword(event.target.value)}
						placeholder={m.displayLockPasswordLabel()}
						onKeyDown={(event) => {
							if (event.key === 'Enter' && password && !submitting) handleSubmit()
						}}
					/>
					{error && <p className="text-xs text-destructive">{error}</p>}
				</div>

				<Button className="mt-4 w-full" onMouseDown={handleSubmit} disabled={!password || submitting}>
					{m.displayLockBlockedSubmit()}
				</Button>
			</div>
		</div>
	)
}
