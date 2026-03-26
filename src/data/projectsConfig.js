/**
 * Projects registry for Dev Tools.
 * - List of projects with doc links
 * - Optional custom React component per project (rendered at /tools/projects/view?project=<slug>)
 */

import BadarHMSView from '@site/src/components/projects/BadarHMSView';
import QuranFlowMigrationView from '@site/src/components/migration_diagram';

/** @type {{ slug: string; name: string; description?: string; docPath: string; docLabel?: string; hasCustomView?: boolean }[]} */
export const projects = [
  {
    slug: 'badar-hms',
    name: 'Badar HMS',
    description: 'Hotel Management System with Opera PMS integration',
    docPath: '/docs/projects/badar-hms/Opera_Integration',
    docLabel: 'Opera Integration',
    hasCustomView: true,
  },
  {
    slug: 'quranflow',
    name: 'QuranFlow',
    description: 'Schema migration and unification view for QuranFlow',
    docPath: '/docs/intro/Node-Advantages',
    docLabel: 'QuranFlow Features',
    hasCustomView: true,
  },
  // Add more projects here. Set hasCustomView: true and register component in getProjectComponent below.
];

/**
 * Resolve custom component for a project slug.
 * @param {string} slug - Project slug from projects[].slug
 * @returns {React.ComponentType | null}
 */
export function getProjectComponent(slug) {
  switch (slug) {
    case 'badar-hms':
      return BadarHMSView;
    case 'quranflow':
      return QuranFlowMigrationView;
    default:
      return null;
  }
}
