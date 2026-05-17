import { getServerClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { OpenAIForm } from '@/components/openai-form'

export default async function OpenAISettingsPage() {
  const supabase = getServerClient()
  const { data } = await supabase.from('app_settings').select('openai_api_key, openai_model').eq('id', 1).maybeSingle()

  return (
    <Card>
      <CardHeader><CardTitle>Configuração OpenAI</CardTitle></CardHeader>
      <CardContent>
        <OpenAIForm initial={data ?? { openai_api_key: null, openai_model: null }} />
      </CardContent>
    </Card>
  )
}
