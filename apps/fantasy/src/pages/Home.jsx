import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-center">
      <span className="text-7xl mb-6">🏆</span>
      <h1 className="text-4xl font-bold text-white mb-3">
        FIFA World Cup 2026
      </h1>
      <h2 className="text-2xl font-semibold text-emerald-400 mb-6">
        Fantasy League
      </h2>
      <p className="text-gray-400 max-w-md mb-8 leading-relaxed">
        Private fantasy league for friends. Build your squad, compete in a blind auction,
        and battle through knockout rounds for glory.
      </p>
      <div className="flex gap-3">
        <Link
          to="/login"
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
        >
          Sign In
        </Link>
        <Link
          to="/register"
          className="bg-gray-800 hover:bg-gray-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
        >
          Register
        </Link>
      </div>
    </div>
  );
}
