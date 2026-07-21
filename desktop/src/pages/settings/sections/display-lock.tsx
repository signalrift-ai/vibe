import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { m } from '~/paraglide/messages.js'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '~/components/ui/dialog'
import { useDisplayLock } from '~/providers/display-lock'
import { SectionCard } from './shared'

const statusLabel = {
	unpaired: m.displayLockStatusUnpaired,
	matched: m.displayLockStatusMatched,
	mismatched: m.displayLockStatusMismatched,
	detectionFailed: m.displayLockStatusUnknown,
} as const

export function DisplayLockSection() {
	const { status, refresh } = useDisplayLock()

	return (
		<div className="space-y-5">
			<SectionCard>
				<div className="flex items-center justify-between">
					<div>
						<p className="text-sm font-medium">{status ? statusLabel[status]() : '…'}</p>
						<p className="mt-1 text-xs text-muted-foreground">
							{status === 'matched' ? m.displayLockPairedDescription() : m.displayLockPairDescription()}
						</p>
					</div>
				</div>
			</SectionCard>

			{status === 'unpaired' && <PairForm onDone={refresh} />}

			{status === 'matched' && (
				<div className="flex flex-wrap gap-2">
					<RepairDialog onDone={refresh} />
					<ChangePasswordDialog />
					<UnpairDialog onDone={refresh} />
				</div>
			)}

			{status === 'detectionFailed' && <p className="text-xs text-muted-foreground">{m.displayLockStatusUnknown()}</p>}
		</div>
	)
}

function PairForm({ onDone }: { onDone: () => void }) {
	const [password, setPassword] = useState('')
	const [confirmPassword, setConfirmPassword] = useState('')
	const [error, setError] = useState<string | null>(null)
	const [submitting, setSubmitting] = useState(false)

	const mismatch = confirmPassword.length > 0 && password !== confirmPassword

	async function submit() {
		if (mismatch || !password) return
		setSubmitting(true)
		setError(null)
		try {
			await invoke('display_lock_pair', { password })
			setPassword('')
			setConfirmPassword('')
			onDone()
		} catch (error) {
			setError(String(error))
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<SectionCard>
			<div className="space-y-3">
				<div className="space-y-1.5">
					<Label>{m.displayLockPasswordLabel()}</Label>
					<Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
				</div>
				<div className="space-y-1.5">
					<Label>{m.displayLockConfirmPasswordLabel()}</Label>
					<Input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
					{mismatch && <p className="text-xs text-destructive">{m.displayLockPasswordMismatch()}</p>}
				</div>
				{error && <p className="text-xs text-destructive">{error}</p>}
				<Button className="w-full" onMouseDown={submit} disabled={!password || mismatch || submitting}>
					{m.displayLockPairButton()}
				</Button>
			</div>
		</SectionCard>
	)
}

function RepairDialog({ onDone }: { onDone: () => void }) {
	const [open, setOpen] = useState(false)
	const [password, setPassword] = useState('')
	const [error, setError] = useState<string | null>(null)
	const [submitting, setSubmitting] = useState(false)

	async function submit() {
		setSubmitting(true)
		setError(null)
		try {
			await invoke('display_lock_repair', { password })
			setPassword('')
			setOpen(false)
			onDone()
		} catch (error) {
			setError(String(error))
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				setOpen(next)
				if (!next) {
					setPassword('')
					setError(null)
				}
			}}>
			<DialogTrigger asChild>
				<Button variant="secondary">{m.displayLockRepairButton()}</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{m.displayLockRepairButton()}</DialogTitle>
				</DialogHeader>
				<div className="space-y-3 pt-2">
					<Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={m.displayLockPasswordLabel()} />
					{error && <p className="text-xs text-destructive">{error}</p>}
					<Button className="w-full" onMouseDown={submit} disabled={!password || submitting}>
						{m.displayLockRepairButton()}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	)
}

function ChangePasswordDialog() {
	const [open, setOpen] = useState(false)
	const [currentPassword, setCurrentPassword] = useState('')
	const [newPassword, setNewPassword] = useState('')
	const [confirmPassword, setConfirmPassword] = useState('')
	const [error, setError] = useState<string | null>(null)
	const [submitting, setSubmitting] = useState(false)

	const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword

	function reset() {
		setCurrentPassword('')
		setNewPassword('')
		setConfirmPassword('')
		setError(null)
	}

	async function submit() {
		if (mismatch || !currentPassword || !newPassword) return
		setSubmitting(true)
		setError(null)
		try {
			await invoke('display_lock_change_password', { currentPassword, newPassword })
			reset()
			setOpen(false)
		} catch (error) {
			setError(String(error))
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				setOpen(next)
				if (!next) reset()
			}}>
			<DialogTrigger asChild>
				<Button variant="secondary">{m.displayLockChangePasswordButton()}</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{m.displayLockChangePasswordButton()}</DialogTitle>
				</DialogHeader>
				<div className="space-y-3 pt-2">
					<div className="space-y-1.5">
						<Label>{m.displayLockCurrentPasswordLabel()}</Label>
						<Input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
					</div>
					<div className="space-y-1.5">
						<Label>{m.displayLockNewPasswordLabel()}</Label>
						<Input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
					</div>
					<div className="space-y-1.5">
						<Label>{m.displayLockConfirmPasswordLabel()}</Label>
						<Input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
						{mismatch && <p className="text-xs text-destructive">{m.displayLockPasswordMismatch()}</p>}
					</div>
					{error && <p className="text-xs text-destructive">{error}</p>}
					<Button className="w-full" onMouseDown={submit} disabled={!currentPassword || !newPassword || mismatch || submitting}>
						{m.displayLockChangePasswordButton()}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	)
}

function UnpairDialog({ onDone }: { onDone: () => void }) {
	const [open, setOpen] = useState(false)
	const [password, setPassword] = useState('')
	const [error, setError] = useState<string | null>(null)
	const [submitting, setSubmitting] = useState(false)

	async function submit() {
		setSubmitting(true)
		setError(null)
		try {
			await invoke('display_lock_unpair', { password })
			setPassword('')
			setOpen(false)
			onDone()
		} catch (error) {
			setError(String(error))
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				setOpen(next)
				if (!next) {
					setPassword('')
					setError(null)
				}
			}}>
			<DialogTrigger asChild>
				<Button variant="ghost" className="text-destructive hover:text-destructive">
					{m.displayLockUnpairButton()}
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{m.displayLockUnpairButton()}</DialogTitle>
				</DialogHeader>
				<div className="space-y-3 pt-2">
					<p className="text-sm text-muted-foreground">{m.displayLockUnpairConfirm()}</p>
					<Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={m.displayLockPasswordLabel()} />
					{error && <p className="text-xs text-destructive">{error}</p>}
					<Button variant="destructive" className="w-full" onMouseDown={submit} disabled={!password || submitting}>
						{m.displayLockUnpairButton()}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	)
}
