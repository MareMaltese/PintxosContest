import { createRouter, createWebHistory } from 'vue-router';
import { useSessionStore } from '../stores/session';
import { useContestStore } from '../stores/contest';

const SESSION_REQUIRED_ROUTES = [
  'has-entry',
  'new-entry',
  'entry-confirmation',
  'waiting-room',
  'gallery',
  'entry-detail',
];
const REGISTRATION_ONLY_ROUTES = ['has-entry', 'new-entry'];
const GALLERY_ROUTES = ['gallery', 'entry-detail'];

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
    { path: '/esperando', name: 'waiting-room', component: () => import('../views/WaitingRoomView.vue') },
    { path: '/galeria', name: 'gallery', component: () => import('../views/GalleryView.vue') },
    { path: '/galeria/:id', name: 'entry-detail', component: () => import('../views/EntryDetailView.vue') },
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

  if (name === 'waiting-room' && !registrationOpen) {
    return { name: 'gallery' };
  }

  if (GALLERY_ROUTES.includes(name) && registrationOpen) {
    return { name: 'waiting-room' };
  }
});
