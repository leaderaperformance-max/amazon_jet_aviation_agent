'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Switch } from '@/components/ui/switch'

export function InboxToggle({ id, initial }: { id: string; initial: boolean }) {
  const router = useRouter()
  const [enabled, setEnabled] = useState(initial)
  const [loading, setLoading] = useState(false)

  async function toggle(checked: boolean) {
    setLoading(true)
    setEnabled(checked)
    const res = await fetch(`/api/inboxes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: checked }),
    })
    if (!res.ok) setEnabled(!checked)
    setLoading(false)
    router.refresh()
  }

  return <Switch checked={enabled} onCheckedChange={toggle} disabled={loading} />
}
