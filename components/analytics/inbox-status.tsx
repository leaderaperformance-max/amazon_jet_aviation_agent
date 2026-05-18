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
        <ul className="space-y-2">
          {inboxes.map(i => (
            <li key={i.id} className="flex items-center justify-between text-sm">
              <span>
                {i.enabled ? '🟢' : '🔴'} <span className="font-medium ml-1">{i.name}</span>
                <span className="text-muted-foreground ml-2">{i.chatwoot_account_id}/{i.chatwoot_inbox_id}</span>
              </span>
              <Link href={`/dashboard/inboxes/${i.id}`} className="text-blue-600 hover:underline">Editar</Link>
            </li>
          ))}
          {inboxes.length === 0 && (
            <li className="text-muted-foreground">Nenhuma inbox configurada.</li>
          )}
        </ul>
      </CardContent>
    </Card>
  )
}
