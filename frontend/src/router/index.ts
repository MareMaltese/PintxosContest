import { createRouter, createWebHistory } from 'vue-router';
import { useSessionStore } from '../stores/session';
import { useContestStore } from '../stores/contest';
import { useAdminAuthStore } from '../stores/adminAuth';
import { SESSION_REQUIRED_ROUTES, REGISTRATION_ONLY_ROUTES, GALLERY_ROUTES, ADMIN_ROUTES } from './routeGroups';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'welcome', component: () => import('../views/WelcomeView.vue') },
    { path: '/registro', name: 'register', component: () => import('../views/RegisterUserView.vue') },
    { path: '/pincho', name: 'has-entry', component: () => import('../views/HasEntryQuestionView.vue') },
    { path: '/pincho/nuevo', name: 'new-entry', component: () => import('../views/NewEntryView.vue') },
    {
      path: '/pincho/confirmacion/:number',
      name: 'entry-confirmation',
      component: () => import('../views/EntryConfirmationView.vue'),
    },
    { path: '/mis-pinchos', name: 'my-entries', component: () => import('../views/MyEntriesView.vue') },
    {
      path: '/mis-pinchos/:id/editar',
      name: 'edit-entry',
      component: () => import('../views/EditEntryView.vue'),
    },
    { path: '/galeria', name: 'gallery', component: () => import('../views/GalleryView.vue') },
    { path: '/galeria/:id', name: 'entry-detail', component: () => import('../views/EntryDetailView.vue') },
    { path: '/desempate', name: 'tiebreak', component: () => import('../views/TiebreakVoteView.vue') },
    { path: '/pinch-o-vision', name: 'medal-results', component: () => import('../views/MedalPodiumView.vue') },
    { path: '/admin', name: 'admin-login', component: () => import('../views/admin/AdminLoginView.vue') },
    {
      path: '/admin/dashboard',
      name: 'admin-dashboard',
      component: () => import('../views/admin/AdminDashboardView.vue'),
    },
    {
      path: '/admin/participantes',
      name: 'admin-participants',
      component: () => import('../views/admin/AdminParticipantsView.vue'),
    },
    { path: '/admin/tapas', name: 'admin-entries', component: () => import('../views/admin/AdminEntriesView.vue') },
    { path: '/admin/fases', name: 'admin-phases', component: () => import('../views/admin/AdminPhasesView.vue') },
    {
      path: '/admin/pinch-o-vision',
      name: 'admin-medal-votes',
      component: () => import('../views/admin/AdminMedalVotesView.vue'),
    },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('../views/NotFoundView.vue') },
  ],
});

router.beforeEach((to) => {
  const session = useSessionStore();
  const contest = useContestStore();
  const name = to.name as string;

  if (SESSION_REQUIRED_ROUTES.includes(name) && !session.user) {
    return { name: 'welcome' };
  }

  const registrationOpen = contest.phase === 'REGISTRATION';

  if ((name === 'welcome' || name === 'register') && session.user) {
    return registrationOpen ? { name: 'has-entry' } : { name: 'gallery' };
  }

  if (REGISTRATION_ONLY_ROUTES.includes(name) && !registrationOpen) {
    return { name: 'gallery' };
  }

  const isTiebreak = contest.phase === 'TIEBREAK';
  if (GALLERY_ROUTES.includes(name) && isTiebreak) {
    return { name: 'tiebreak' };
  }
  if (name === 'tiebreak' && !isTiebreak) {
    return { name: 'gallery' };
  }

  const adminAuth = useAdminAuthStore();
  if (ADMIN_ROUTES.includes(name) && !adminAuth.pin) {
    return { name: 'admin-login' };
  }
  if (name === 'admin-login' && adminAuth.pin) {
    return { name: 'admin-dashboard' };
  }
});
