export const TEAM_KEY = 'team'
export type ChatThreadKey = string

/** Map a chat selection to its thread key in the messages store. */
export function threadKeyOf(selection: 'team' | { conversationId: string }): ChatThreadKey {
  return selection === 'team' ? TEAM_KEY : selection.conversationId
}
