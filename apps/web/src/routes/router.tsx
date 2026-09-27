import { AppShell } from '../components/AppShell';
import { HomePage } from './HomePage';
import { NotFoundPage } from './NotFoundPage';
import { StartPage } from './StartPage';

export const routes = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'start', element: <StartPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
