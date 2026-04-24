export type UserRole = 'admin' | 'participant';

export interface User {
  id: string;
  email: string;
  display_name: string;
  avatar_url?: string;
  is_admin: boolean;
  created_at?: string;
}
