declare global {
	namespace App {
		interface Locals {
			session: import('better-auth').Session | null;
			user: {
				id: string;
				name?: string | null;
				email?: string | null;
				image?: string | null;
			} | null;
		}
	}
}

export {};
