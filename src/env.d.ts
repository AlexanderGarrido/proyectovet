/// <reference path="../.astro/types.d.ts" />

type UserRole = 'admin' | 'veterinario' | 'recepcionista';

declare namespace App {
  interface Locals {
    user?: {
      id: string;
      name: string;
      email: string;
      role: UserRole;
      image?: string | null;
      phone?: string | null;
    };
    session?: {
      id: string;
      expiresAt: Date;
      token: string;
    };
  }
}
