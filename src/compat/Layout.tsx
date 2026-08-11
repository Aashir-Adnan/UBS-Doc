import { useEffect, type ReactNode } from 'react'

export default function Layout({ title, description, children }: {
  title?: string; description?: string; children: ReactNode
}) {
  useEffect(() => {
    if (title) document.title = `${title} | UBS Framework`
    return () => { document.title = 'UBS Framework' }
  }, [title])
  useEffect(() => {
    if (!description) return
    let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'description'
      document.head.appendChild(meta)
    }
    meta.content = description
  }, [description])
  return <>{children}</>
}
