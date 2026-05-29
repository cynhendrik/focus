import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import { ReactRenderer } from '@tiptap/react'
import { SlashMenu, filterItems, type SlashCommandItem, type SlashMenuRef } from './slashMenu'

/**
 * Slash-command extension. Triggers on `/`, opens a floating menu of block
 * insertion commands.
 *
 * The menu is positioned manually (no tippy.js dep) by reading the cursor's
 * client coordinates from ProseMirror's view.coordsAtPos() and applying them
 * to a body-portal element via inline style.
 */
export const SlashCommands = Extension.create({
  name: 'slashCommands',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        startOfLine: false,
        allowSpaces: false,
        command: ({ editor, range, props }: any) => {
          (props as SlashCommandItem).command({ editor, range })
        },
        items: ({ query }: { query: string }) => filterItems(query),
        render: () => {
          let component: ReactRenderer<SlashMenuRef> | null = null
          let portalEl: HTMLDivElement | null = null

          const place = (props: any) => {
            if (!portalEl) return
            const rect: DOMRect | null = props?.clientRect?.()
            if (!rect) return
            const padding = 8
            const menuW = 260   // approx; menu can be wider, this is starting estimate
            const menuH = 320   // max-height we set in CSS
            let left = rect.left
            let top  = rect.bottom + padding
            // Right edge guard
            if (left + menuW > window.innerWidth) left = window.innerWidth - menuW - padding
            // Bottom edge guard → flip above the caret
            if (top + menuH > window.innerHeight) top = rect.top - menuH - padding
            portalEl.style.left = `${left}px`
            portalEl.style.top  = `${top}px`
          }

          return {
            onStart: (props: any) => {
              portalEl = document.createElement('div')
              portalEl.style.position = 'fixed'
              portalEl.style.zIndex = '1000'
              portalEl.style.left = '-9999px'
              portalEl.style.top  = '-9999px'
              document.body.appendChild(portalEl)

              component = new ReactRenderer(SlashMenu, {
                props: {
                  items: props.items,
                  command: (item: SlashCommandItem) => props.command(item),
                },
                editor: props.editor,
              })
              if (component.element) portalEl.appendChild(component.element as Node)

              // Position after mount
              requestAnimationFrame(() => place(props))
            },

            onUpdate: (props: any) => {
              component?.updateProps({
                items: props.items,
                command: (item: SlashCommandItem) => props.command(item),
              })
              place(props)
            },

            onKeyDown: (props: any) => {
              if (props.event.key === 'Escape') {
                ;(props as any).range && component?.destroy()
                return true
              }
              return component?.ref?.onKeyDown(props.event) ?? false
            },

            onExit: () => {
              component?.destroy()
              if (portalEl?.parentElement) portalEl.parentElement.removeChild(portalEl)
              component = null
              portalEl = null
            },
          }
        },
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ]
  },
})

