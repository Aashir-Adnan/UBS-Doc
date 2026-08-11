// Ported verbatim from the Docusaurus `sidebars.js` `tutorialSidebar` array.
// Docusaurus shape `{ type: 'category', label, items }` collapses to
// `{ label, items }`; doc-id strings stay strings. Order is load-bearing —
// it drives both the tree and the prev/next footer, so keep it in sync with
// sidebars.js if that file is ever the source of truth again.

export type SidebarNode = string | { label: string; items: SidebarNode[] }

export const SIDEBAR: SidebarNode[] = [
  'init',
  {
    label: 'Framework Introduction',
    items: ['intro/UBS_Framework_Features', 'intro/Node-Advantages'],
  },
  {
    label: 'Framework Database',
    items: ['database/Lucidchart', 'database/Project_DB_Base_DB_Mapper'],
  },
  {
    label: 'Framework Backend',
    items: [
      'backend/UBS-intro',
      'backend/tenancy',
      'backend/roles-permissions',
      {
        label: 'Github Workflows',
        items: ['backend/githubWorkflows/ai-reviewer', 'backend/githubWorkflows/ai-agent'],
      },
      {
        label: 'Integrations',
        items: ['backend/Socket', 'backend/Payments', 'backend/local-whisper-setup'],
      },
      'backend/FAQs',
    ],
  },
  {
    label: 'Framework Frontend',
    items: [
      'frontend/UBS-intro',
      'frontend/intro',
      'frontend/FAQs',
      'frontend/tenant-scoping-frontend',
      'FRONTEND_TENANT_PROJECT_ACCESS',
      'FRONTEND_REPOS_MEETINGS_TENANCY',
    ],
  },
  {
    label: 'Framework Agents',
    items: ['agents/agent-issue-format', 'agents/claude-github-issues-agent'],
  },
  {
    label: 'HMS Documentation',
    items: [
      {
        label: 'Major Implementations',
        items: [
          {
            label: 'Booking Rules',
            items: [
              'hms-documentation/major-implementations/booking-rules/booking-rules-requirements',
              'hms-documentation/major-implementations/booking-rules/booking-rules-implementation',
              'hms-documentation/major-implementations/booking-rules/booking-rules-test-report',
            ],
          },
          {
            label: 'Filter Options & Pricing Pipeline',
            items: [
              'hms-documentation/major-implementations/filter-options-and-pricing/filter-options-and-pricing',
            ],
          },
          {
            label: 'Guest Search & Discovery',
            items: [
              'hms-documentation/major-implementations/guest-search-and-discovery/backend-implementation',
              'hms-documentation/major-implementations/guest-search-and-discovery/frontend-implementation',
            ],
          },
          {
            label: 'Review Categories',
            items: [
              'hms-documentation/major-implementations/review-categories/backend-implementation',
              'hms-documentation/major-implementations/review-categories/frontend-implementation',
            ],
          },
          {
            label: 'Payment & Refund Flow',
            items: [
              'hms-documentation/major-implementations/payment-and-refund/payment-and-refund',
              'hms-documentation/major-implementations/payment-and-refund/overflow-refund-cron',
            ],
          },
          {
            label: 'Front Desk Check-In & Check-Out',
            items: [
              'hms-documentation/major-implementations/front-desk-checkout/front-desk-checkout',
            ],
          },
          {
            label: 'Email Branding & Templates',
            items: [
              'hms-documentation/major-implementations/email-branding/email-branding',
            ],
          },
          {
            label: 'Email Validation Pipeline',
            items: [
              'hms-documentation/major-implementations/email-validation/email-validation',
            ],
          },
          {
            label: 'Access Token Security',
            items: [
              'hms-documentation/major-implementations/access-token-security/access-token-security',
            ],
          },
          {
            label: 'Booking Changes Pipeline',
            items: [
              'hms-documentation/major-implementations/booking-changes-pipeline/booking-changes-pipeline',
            ],
          },
          {
            label: 'Landmarks, Cities, Regions and Hotels',
            items: [
              'hms-documentation/major-implementations/landmarks-cities-regions-hotels/landmarks-cities-regions-hotels',
            ],
          },
          {
            label: 'Centralized Booking Pricing',
            items: [
              'hms-documentation/major-implementations/centralized-booking-pricing/centralized-booking-pricing',
            ],
          },
          {
            label: 'Stage Unit Reservation',
            items: [
              'hms-documentation/major-implementations/stage-unit-reservation/stage-unit-reservation',
            ],
          },
          {
            label: 'Permission Manager',
            items: [
              'hms-documentation/major-implementations/permission-manager/permission-manager',
            ],
          },
          {
            label: 'Seniority Scope',
            items: [
              'hms-documentation/major-implementations/seniority-scope/seniority-scope',
            ],
          },
          {
            label: 'Guest Booking Enhancements',
            items: [
              'hms-documentation/major-implementations/guest-booking-enhancements/guest-booking-enhancements',
              'hms-documentation/major-implementations/guest-booking-enhancements/frontend-implementation',
            ],
          },
        ],
      },
      {
        label: 'Minor Implementations',
        items: [
          {
            label: 'Requires Stay Service Flag',
            items: [
              'hms-documentation/minor-implementations/requires-stay-service-flag/backend-implementation',
              'hms-documentation/minor-implementations/requires-stay-service-flag/frontend-implementation',
            ],
          },
        ],
      },
      {
        label: 'Guest APIs',
        items: [
          'hms-documentation/guest-apis/guest-tenant-scoped-apis',
          {
            label: 'Guest Search & Filter',
            items: [
              'hms-documentation/guest-apis/guest-search-filter/guest-search-filter',
            ],
          },
          {
            label: 'Guest Availability',
            items: [
              'hms-documentation/guest-apis/guest-availability/guest-availability',
            ],
          },
          {
            label: 'Guest Booking Flow',
            items: [
              'hms-documentation/guest-apis/guest-booking-flow/guest-booking-flow',
              'hms-documentation/guest-apis/guest-booking-flow/guest-booking-edit',
              'hms-documentation/guest-apis/guest-booking-flow/booking-management',
            ],
          },
          {
            label: 'Guest Upcoming Bookings',
            items: [
              'hms-documentation/guest-apis/guest-bookings-upcoming/guest-bookings-upcoming',
            ],
          },
          {
            label: 'Guest Past Bookings',
            items: [
              'hms-documentation/guest-apis/guest-bookings-past/guest-bookings-past',
            ],
          },
          {
            label: 'Guest Current Booking',
            items: [
              'hms-documentation/guest-apis/guest-bookings-current/guest-bookings-current',
            ],
          },
          {
            label: 'Guest Booking Check In',
            items: [
              'hms-documentation/guest-apis/guest-booking-checkin/guest-booking-checkin',
            ],
          },
          {
            label: 'Guest Booking Check Out',
            items: [
              'hms-documentation/guest-apis/guest-booking-checkout/guest-booking-checkout',
            ],
          },
          {
            label: 'Guest Booking Cancel',
            items: [
              'hms-documentation/guest-apis/guest-booking-cancel/guest-booking-cancel',
            ],
          },
          {
            label: 'Guest Bookings Service',
            items: [
              'hms-documentation/guest-apis/guest-bookings-service/guest-bookings-service',
              'hms-documentation/guest-apis/guest-bookings-service/add-services-to-booking',
            ],
          },
          {
            label: 'Guest Favorites',
            items: [
              'hms-documentation/guest-apis/guest-favorites/guest-favorites',
            ],
          },
          {
            label: 'Guest Services',
            items: [
              'hms-documentation/guest-apis/guest-services/guest-services',
            ],
          },
          {
            label: 'Guest Packages',
            items: [
              'hms-documentation/guest-apis/guest-packages/guest-packages',
            ],
          },
          {
            label: 'Guest Unavailable Dates',
            items: [
              'hms-documentation/guest-apis/guest-unavailable-dates/guest-unavailable-dates',
            ],
          },
          {
            label: 'Guest Onboarding KYC',
            items: [
              'hms-documentation/guest-apis/guest-onboarding-kyc/guest-onboarding-kyc',
            ],
          },
          {
            label: 'Guest Booking Reschedule',
            items: [
              'hms-documentation/guest-apis/guest-booking-reschedule/guest-booking-reschedule',
            ],
          },
          {
            label: 'Guest Scheduler',
            items: [
              'hms-documentation/guest-apis/guest-scheduler/guest-scheduler',
            ],
          },
          {
            label: 'Guest Service Categories',
            items: [
              'hms-documentation/guest-apis/guest-service-categories/guest-service-categories',
            ],
          },
          {
            label: 'Guest Check-In Eligibility',
            items: [
              'hms-documentation/guest-apis/guest-checkin-eligibility/guest-checkin-eligibility',
            ],
          },
          {
            label: 'Guest Token Refresh',
            items: [
              'hms-documentation/guest-apis/guest-token-refresh/guest-token-refresh',
            ],
          },
          {
            label: 'Guest Email Notifications',
            items: [
              'hms-documentation/guest-apis/guest-email-notifications/guest-email-notifications',
            ],
          },
          {
            label: 'Guest Networking Details',
            items: [
              'hms-documentation/guest-apis/guest-networking-details/guest-networking-details',
            ],
          },
          {
            label: 'Fetch Guest Documents',
            items: [
              'hms-documentation/guest-apis/fetch-guest-documents/fetch-guest-documents',
            ],
          },
          {
            label: 'Fetch Guest Document Tags',
            items: [
              'hms-documentation/guest-apis/fetch-guest-document-tags/fetch-guest-document-tags',
            ],
          },
          {
            label: 'Push Notifications',
            items: [
              'hms-documentation/guest-apis/push-notifications/push-notifications',
            ],
          },
          {
            label: 'Guest Pricing Rules',
            items: [
              'hms-documentation/guest-apis/guest-pricing-rules/guest-pricing-rules',
            ],
          },
          {
            label: 'Filter Options (Split)',
            items: [
              'hms-documentation/guest-apis/filter-options/filter-options',
            ],
          },
          {
            label: 'Guest Hotels',
            items: [
              'hms-documentation/guest-apis/guest-hotels/guest-hotels',
            ],
          },
          {
            label: 'Guest Hotel Details',
            items: [
              'hms-documentation/guest-apis/guest-hotel-details/guest-hotel-details',
            ],
          },
          {
            label: 'Guest Booking Constraints',
            items: [
              'hms-documentation/guest-apis/guest-booking-constraints/guest-booking-constraints',
            ],
          },
          {
            label: 'Guest Review',
            items: [
              'hms-documentation/guest-apis/guest-review/guest-review',
            ],
          },
          {
            label: 'Guest Auth Refresh Tokens',
            items: [
              'api/guest-auth-refresh-tokens',
            ],
          },
          {
            label: 'Guest Networking Details',
            items: [
              'api/guest-networking-details',
            ],
          },
          {
            label: 'Authentication',
            items: [
              'api/authentication',
            ],
          },
        ],
      },
      {
        label: 'Payment Gateways',
        items: [
          {
            label: 'Moyasar',
            items: [
              'hms-documentation/payment-gateways/moyasar/setup',
              'hms-documentation/payment-gateways/moyasar/payment-flow',
              'hms-documentation/payment-gateways/moyasar/webhook',
              'hms-documentation/payment-gateways/moyasar/booking-payment-lifecycle',
              'hms-documentation/payment-gateways/moyasar/saved-cards',
              'hms-documentation/payment-gateways/moyasar/frontend-integration',
            ],
          },
        ],
      },
      {
        label: 'Tenant Governance',
        items: [
          'hms-documentation/tenant-governance/README',
          'hms-documentation/tenant-governance/tenant-governance-model/governance-model',
          'hms-documentation/tenant-governance/per-tenant-cloning/per-tenant-cloning',
          'hms-documentation/tenant-governance/per-tenant-resource-assignment/resource-assignments',
          {
            label: 'Config Keys',
            items: [
              'hms-documentation/tenant-governance/config-keys/config-keys',
              'hms-documentation/tenant-governance/config-keys/config-storage-model/config-storage-model',
              'hms-documentation/tenant-governance/config-keys/config-keys-catalog/config-keys-catalog',
            ],
          },
          'hms-documentation/tenant-governance/tenant-configs/tenant-configs',
          'hms-documentation/tenant-governance/config-constraints/config-constraints',
          'hms-documentation/tenant-governance/permission-groups-permissions/permission-groups-permissions',
          'hms-documentation/tenant-governance/permission-descriptions/permission-descriptions',
          'hms-documentation/tenant-governance/original-to-clone-propagation/original-to-clone-propagation',
          'hms-documentation/tenant-governance/deferred-delete-probation/deferred-delete-probation',
          'hms-documentation/tenant-governance/tenant-lifecycle-cron/tenant-lifecycle-cron',
        ],
      },
      'hms-documentation/tenant-seed-data-requirements',
      {
        label: 'Admin APIs',
        items: [
          'api/admin-code',
          'hms-documentation/admin-apis/admin-code-verify',
          'hms-documentation/admin-apis/admin-code-reset',
          'hms-documentation/admin-apis/profile',
          {
            label: 'Guest Management',
            items: [
              'hms-documentation/admin-apis/admin-create-guest-user',
              'hms-documentation/admin-apis/admin-create-guest-booking',
            ],
          },
          {
            label: 'Catalog & Pricing',
            items: [
              'hms-documentation/admin-apis/catalog-crud',
              'hms-documentation/admin-apis/catalog-pricing-crud',
              'hms-documentation/admin-apis/pricing-rules-crud',
              'hms-documentation/admin-apis/packages-crud',
              'hms-documentation/admin-apis/plan-groups-crud',
              'hms-documentation/admin-apis/services-crud',
              'hms-documentation/admin-apis/delivery-units-crud',
              'hms-documentation/admin-apis/location-types-crud',
              'hms-documentation/admin-apis/region-countries-crud',
              'hms-documentation/admin-apis/landmarks-crud',
              'hms-documentation/admin-apis/service-location-facets',
            ],
          },
          {
            label: 'Configuration',
            items: [
              'hms-documentation/admin-apis/config-keys-enabled-for',
              'hms-documentation/admin-apis/config-possible-values',
              'hms-documentation/admin-apis/config-possible-values-crud',
              'hms-documentation/admin-apis/frontpage-data',
            ],
          },
          {
            label: 'Tenant Provisioning',
            items: [
              'hms-documentation/admin-apis/tenant-provisioning-grouped-crud',
              'hms-documentation/admin-apis/tenant-assignments-grouped-crud',
              'hms-documentation/admin-apis/service-manager-provisioning',
              'hms-documentation/admin-apis/tenant-admin-candidates-dropdown',
              'hms-documentation/admin-apis/dev-seed-tenant',
            ],
          },
          {
            label: 'Users & Permissions',
            items: [
              'hms-documentation/admin-apis/users-grouped-crud',
              'hms-documentation/admin-apis/permission-groups-grouped-crud',
              'hms-documentation/admin-apis/permission-manager',
              'hms-documentation/admin-apis/permissions-dropdown',
              'hms-documentation/admin-apis/user-role-permission-array',
              'hms-documentation/admin-apis/urdd-dropdown',
            ],
          },
          {
            label: 'Validation',
            items: [
              'hms-documentation/admin-apis/validation-email',
              'hms-documentation/admin-apis/validation-duplicate',
            ],
          },
        ],
      },
    ],
  },
  {
    label: 'Projects',
    items: [
      {
        label: 'Badar HMS',
        items: [
          {
            label: 'V1',
            items: [
              'projects/badar-hms/v1/OPERA_PMS_Integration_Solutions',
            ],
          },
          {
            label: 'V2',
            items: [
              'projects/badar-hms/v2/OPERA_PMS_Integration_Solutions_v2',
            ],
          },
          {
            label: 'V3',
            items: [
              'projects/badar-hms/v3/OPERA_PMS_Integration_Solutions_v3',
            ],
          },
          {
            label: 'V4',
            items: [
              'projects/badar-hms/v4/OPERA_PMS_Integration_Solutions_v4',
            ],
          },
          'projects/badar-hms/Opera_Config',
        ],
      },
    ],
  },
]

export function flattenSidebar(nodes: SidebarNode[] = SIDEBAR): string[] {
  return nodes.flatMap(n => (typeof n === 'string' ? [n] : flattenSidebar(n.items)))
}

// Doc items are bare ids in sidebars.js — Docusaurus read each file's
// frontmatter for a label. Eagerly importing 144 files just to title the tree
// would defeat the lazy loading, so the last path segment is prettified
// instead: 'admin-apis/validation-duplicate' → 'validation duplicate'.
export function docLabel(id: string): string {
  const last = id.split('/').pop() || id
  return last.replace(/[-_]+/g, ' ')
}

// Index-path keys ('5.2.4') of every category on the way to `id`. Category
// labels repeat across the tree, so position — not label — is the stable key
// the sidebar uses to seed its open/closed state.
export function categoryPathFor(
  id: string,
  nodes: SidebarNode[] = SIDEBAR,
  prefix = '',
): string[] | null {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    const key = prefix ? `${prefix}.${i}` : String(i)
    if (typeof node === 'string') {
      if (node === id) return []
      continue
    }
    const inner = categoryPathFor(id, node.items, key)
    if (inner) return [key, ...inner]
  }
  return null
}
