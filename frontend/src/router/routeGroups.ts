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
];
export const REGISTRATION_ONLY_ROUTES = ['has-entry', 'new-entry', 'edit-entry'];
// Routes that require a session but shouldn't show the footer nav -- there's nothing
// to navigate to from here, the only action is voting.
export const NO_FOOTER_ROUTES = ['tiebreak'];
export const GALLERY_ROUTES = ['gallery', 'entry-detail'];
export const ADMIN_ROUTES = [
  'admin-dashboard',
  'admin-participants',
  'admin-entries',
  'admin-phases',
  'admin-medal-votes',
];
