import { WidgetRevenue } from './widgets/WidgetRevenue'
import { WidgetTodos }   from './widgets/WidgetTodos'
import { WidgetMails }   from './widgets/WidgetMails'
import { WidgetWeek }    from './widgets/WidgetWeek'
import { WidgetHeute }   from './widgets/WidgetHeute'
import type { CorraWidgetType } from '@/lib/ai/corra-intelligence'

interface Props {
  type: CorraWidgetType
}

export function CorraWidget({ type }: Props) {
  switch (type) {
    case 'revenue': return <WidgetRevenue />
    case 'todos':   return <WidgetTodos />
    case 'mails':   return <WidgetMails />
    case 'week':    return <WidgetWeek />
    case 'heute':   return <WidgetHeute />
  }
}
