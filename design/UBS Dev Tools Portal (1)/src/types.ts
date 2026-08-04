export type Screen =
  | 'signin'
  | 'home'
  | 'tools'
  | 'meetings'
  | 'meetings-create'
  | 'meetings-transcribe'
  | 'meetings-analyze'
  | 'github'
  | 'database'
  | 'api-builder'
  | 'notify'
  | 'lucid-sanitize'
  | 'projects'
  | 'my-projects'
  | 'repositories'
  | 'tenant-admin'
  | 'access-restricted'
  | 'loading-state'
  | 'pending-state'

export type Theme = 'light' | 'dark'

export interface NavItem {
  id: Screen
  label: string
  icon: string
}
