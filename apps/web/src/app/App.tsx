import { RouterProvider } from 'react-router';
import { appRouter } from '../routes/appRouter';

export function App() {
  return <RouterProvider router={appRouter} />;
}
