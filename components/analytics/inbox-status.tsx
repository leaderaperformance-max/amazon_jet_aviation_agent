import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'

interface Inbox {
  id: string
  name: string
  chatwoot_account_id: number
  chatwoot_inbox_id: number
  enabled: boolean
}

export function InboxStatusList({ inboxes }: { inboxes: Inbox[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Status das inboxes</CardTitle>
        <Link href="/dashboard/inboxes/new" className={buttonVariants({ size: 'sm' })}>+ Nova Inbox</Link>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {inboxes.map(i => (
            <li key={i.id} className="flex items-center justify-between py-3 text-sm">
              <span className="flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full ${i.enabled ? 'bg-success' : 'bg-danger'}`} />
                <span className="font-medium">{i.name}</span>
                <span className="text-muted-foreground tabular-nums">{i.chatwoot_account_id}/{i.chatwoot_inbox_id}</span>
              </span>
              <Link href={`/dashboard/inboxes/${i.id}`} className="text-accent hover:underline">Editar</Link>
            </li>
          ))}
          {inboxes.length === 0 && (
            <li className="py-3 text-muted-foreground">Nenhuma inbox configurada.</li>
          )}
        </ul>
      </CardContent>
    </Card>
  )
}
