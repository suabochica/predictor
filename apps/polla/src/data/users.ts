import type { User } from '../types';

export const users: User[] = [
  { user_id: 'fallback-1', display_name: 'Sergio', total_points: 0 },
  { user_id: 'fallback-2', display_name: 'María', total_points: 0 },
  { user_id: 'fallback-3', display_name: 'Carlos', total_points: 0 },
  { user_id: 'fallback-4', display_name: 'Ana', total_points: 0 },
  { user_id: 'fallback-5', display_name: 'Diego', total_points: 0 },
  { user_id: 'fallback-6', display_name: 'Laura', total_points: 0 },
  { user_id: 'fallback-7', display_name: 'Andrés', total_points: 0 },
  { user_id: 'fallback-8', display_name: 'Sofía', total_points: 0 },
  { user_id: 'fallback-9', display_name: 'Miguel', total_points: 0 },
  { user_id: 'fallback-10', display_name: 'Valentina', total_points: 0 },
  { user_id: 'fallback-11', display_name: 'Javier', total_points: 0 },
  { user_id: 'fallback-12', display_name: 'Camila', total_points: 0 },
  { user_id: 'fallback-13', display_name: 'Pablo', total_points: 0 },
  { user_id: 'fallback-14', display_name: 'Isabella', total_points: 0 },
];

export function getLeaderboard(): User[] {
  return [...users].sort((a, b) => b.total_points - a.total_points);
}
