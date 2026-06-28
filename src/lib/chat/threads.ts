export const TEAM_KEY = 'team'
export type ChatThreadKey = string

/** Map a chat selection to its thread key. 'inbox' has no message thread. */
export function threadKeyOf(selection: 'inbox' | 'team' | { conversationId: string }): ChatThreadKey {
  if (selection === 'team') return TEAM_KEY
  if (selection === 'inbox') return 'inbox'
  return selection.conversationId
}
