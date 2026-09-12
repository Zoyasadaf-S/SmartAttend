import * as bcrypt from 'bcryptjs'
import * as fs from 'fs'
import * as path from 'path'

export interface User {
  id: string
  email: string
  name: string
  role: 'super_admin' | 'admin' | 'faculty'
  department: string
  passwordHash: string
  createdAt: string
  active: boolean
}
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5001/api';

async function fetchFromBackend(endpoint: string, options: RequestInit = {}) {
  // In a real app, you would attach the JWT token here from the Next.js session
  const res = await fetch(`${BACKEND_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error || 'Backend request failed');
  }
  
  return res.json();
}

export async function getAllUsers(): Promise<User[]> {
  // Assuming we have an admin endpoint. Would need auth headers in real implementation.
  return fetchFromBackend('/admin/users');
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const users = await getAllUsers();
  return users.find(u => u.email.toLowerCase() === email.toLowerCase()) ?? null;
}

export async function getUserById(id: string): Promise<User | null> {
  const users = await getAllUsers();
  return users.find(u => u.id === id) ?? null;
}

export async function updateUser(id: string, updates: Partial<Omit<User, 'id' | 'passwordHash'>>): Promise<User | null> {
  if (updates.active !== undefined) {
    return fetchFromBackend(`/admin/users/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: updates.active ? 'ACTIVE' : 'INACTIVE' })
    });
  }
  // Other updates would need appropriate endpoints
  return null;
}

// For verifyPassword, it's now handled entirely by the backend login route.
// We keep a dummy here if something still references it synchronously.
export function verifyPassword(plain: string, hash: string): boolean {
  return false; 
}
