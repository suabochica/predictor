import type { User } from '../types';

// 14 users for the World Cup predictor
export const users: User[] = [
  { user_id: 1, name: 'Sergio', avatar: '👨‍💻', total_points: 0 },
  { user_id: 2, name: 'María', avatar: '👩‍🎨', total_points: 0 },
  { user_id: 3, name: 'Carlos', avatar: '🏀', total_points: 0 },
  { user_id: 4, name: 'Ana', avatar: '📚', total_points: 0 },
  { user_id: 5, name: 'Diego', avatar: '⚽', total_points: 0 },
  { user_id: 6, name: 'Laura', avatar: '🎵', total_points: 0 },
  { user_id: 7, name: 'Andrés', avatar: '🎮', total_points: 0 },
  { user_id: 8, name: 'Sofía', avatar: '🌟', total_points: 0 },
  { user_id: 9, name: 'Miguel', avatar: '🚀', total_points: 0 },
  { user_id: 10, name: 'Valentina', avatar: '💃', total_points: 0 },
  { user_id: 11, name: 'Javier', avatar: '🎸', total_points: 0 },
  { user_id: 12, name: 'Camila', avatar: '🎨', total_points: 0 },
  { user_id: 13, name: 'Pablo', avatar: '🏆', total_points: 0 },
  { user_id: 14, name: 'Isabella', avatar: '🌹', total_points: 0 },
];

// Get users sorted by total points (descending)
export function getLeaderboard(): User[] {
  return [...users].sort((a, b) => b.total_points - a.total_points);
}

// Get a single user by ID
export function getUserById(id: number): User | undefined {
  return users.find(u => u.user_id === id);
}