import { InboxForm } from '@/components/inbox-form'
import { DEFAULT_JET_PROMPT } from '@/lib/prompt'

export default function NewInboxPage() {
  return <InboxForm defaultSystemPrompt={DEFAULT_JET_PROMPT} />
}
