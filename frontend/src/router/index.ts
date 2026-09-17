import { createRouter, createWebHistory } from 'vue-router';
import { useSessionStore } from '../stores/session';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'welcome', component: () => import('../views/WelcomeView.vue') },
    { path: '/registro', name: 'register', component: () => import('../views/RegisterUserView.vue') },
  ],
});

router.beforeEach((to) => {
  const session = useSessionStore();
  if (to.name === 'register' && session.user) {
    return { name: 'welcome' };
  }
});
