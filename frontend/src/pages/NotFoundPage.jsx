import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 text-center">
      <p className="text-6xl font-bold text-slate-300">404</p>
      <p className="mt-4 text-slate-600">Page not found</p>
      <Link to="/" className="btn-primary mt-6">Go home</Link>
    </div>
  );
}
