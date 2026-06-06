import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: ReactNode
  titleDot?: boolean
  right?: ReactNode
}

export function PageHeader({ title, titleDot = true, right }: PageHeaderProps) {
  return (
    <div className="greeting">
      <h1 className="greeting-title">
        {title}{titleDot && <em>.</em>}
      </h1>
      {right}
    </div>
  )
}
