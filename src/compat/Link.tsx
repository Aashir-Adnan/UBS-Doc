import { Link as RouterLink } from 'react-router-dom'
import type { ComponentProps, ReactNode } from 'react'

type Props = { to?: string; href?: string; children?: ReactNode } &
  Omit<ComponentProps<'a'>, 'href'>

export default function Link({ to, href, children, ...rest }: Props) {
  const target = href ?? to
  if (!target) return <a {...rest}>{children}</a>
  if (/^(https?:)?\/\//.test(target) || href) {
    return <a href={target} target="_blank" rel="noreferrer" {...rest}>{children}</a>
  }
  return <RouterLink to={target} {...rest}>{children}</RouterLink>
}
