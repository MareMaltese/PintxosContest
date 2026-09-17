import { createRouter, createWebHistory } from 'vue-router';
import { useSessionStore } from '../stores/session';
import { useContestStore } from '../stores/contest';

const SESSION_REQUIRED_ROUTES = ['has-entry', 'new-entry', 'entry-confirmation', 'waiting-room'];
const REGISTRATION_ONLY_ROUTES = ['has-entry', 'new-entry'];

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
  ],
});

router.beforeEach((to) => {
  const session = useSessionStore();
  const contest = useContestStore();
  const name = to.name as string;

  if (SESSION_REQUIRED_ROUTES.includes(name) && !session.user) {
    return { name: 'welcome' };
  }

  if ((name === 'welcome' || name === 'register') && session.user) {
    return contest.phase === 'REGISTRATION' ? { name: 'has-entry' } : { name: 'waiting-room' };
  }

  if (REGISTRATION_ONLY_ROUTES.includes(name) && contest.phase !== 'REGISTRATION') {
    return { name: 'waiting-room' };
  }
});
