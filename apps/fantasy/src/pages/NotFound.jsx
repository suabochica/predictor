import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <p className="text-6xl mb-4">🚫</p>
      <h1 className="text-2xl font-bold text-white mb-2">Page not found</h1>
      <p className="text-gray-400 mb-6">The page you're looking for doesn't exist.</p>
      <Link to="/dashboard" className="text-emerald-400 hover:text-emerald-300">
        Back to Dashboard →
      </Link>
    </div>
  );
}
