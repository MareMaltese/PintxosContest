export const SESSION_REQUIRED_ROUTES = [
  'has-entry',
  'new-entry',
  'entry-confirmation',
  'my-entries',
  'edit-entry',
  'gallery',
  'entry-detail',
  'tiebreak',
  'medal-results',
  'my-ranking',
];
export const REGISTRATION_ONLY_ROUTES = ['has-entry', 'new-entry', 'edit-entry'];
// Routes that require a session but shouldn't show the footer nav -- there's nothing
// to navigate to from here, the only action is voting.
export const NO_FOOTER_ROUTES = ['tiebreak'];
export const GALLERY_ROUTES = ['gallery', 'entry-detail', 'my-ranking'];
export const ADMIN_ROUTES = [
  'admin-dashboard',
  'admin-participants',
  'admin-entries',
  'admin-phases',
  'admin-medal-votes',
];

// The personal "Clasificación" tab only exists in ranking mode, while voting and
// afterwards (read-only) -- during a tiebreak the gallery redirect sends it there.
export function isRankingTabAvailable(votingMode: string, phase: string): boolean {
  return votingMode === 'RANKING' && (phase === 'VOTING' || phase === 'RESULTS');
}
