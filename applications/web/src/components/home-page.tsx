import type { JSX } from 'react';
import type { ApplicationUser } from '@web/types/user';
import { CopyButton } from '@web/components/copy-button';

type HomePageProps = {
	user: ApplicationUser | null;
	baseUrl: string;
};

export function HomePage(props: HomePageProps): JSX.Element {
	const mcpEndpoint = `${props.baseUrl}/mcp`;

	return (
		<main className="mx-auto mt-12 w-full max-w-3xl px-6">
			<div className="rounded-3xl border border-slate-200 bg-white p-10 shadow-lg shadow-slate-200/40">
				<p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Protokit</p>
				<h1 className="mt-3 text-4xl font-black tracking-tight text-slate-900">MCP OAuth Server</h1>
				<p className="mt-4 text-lg text-slate-600">
					Bun-native React server with OAuth, MCP transport, and Google sign-in.
				</p>

				{props.user ? (
					<section className="mt-8 rounded-2xl bg-slate-50 p-6">
						<p className="text-sm font-medium text-slate-500">Signed in as</p>
						<p className="mt-2 text-xl font-bold text-slate-900">{props.user.email}</p>
						<div className="mt-5 flex flex-wrap items-center gap-3">
							<a
								href="/oauth/authorize"
								className="inline-flex items-center rounded-xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white hover:bg-sky-500"
							>
								Review OAuth Request
							</a>
							<form method="POST" action="/auth/sign-out">
								<button
									type="submit"
									className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
								>
									Sign Out
								</button>
							</form>
						</div>
					</section>
				) : (
					<section className="mt-8 rounded-2xl bg-slate-50 p-6">
						<p className="text-slate-600">Sign in with Google to authorize OAuth clients.</p>
						<a
							href="/auth/google/start?callback_path=/"
							className="mt-5 inline-flex items-center rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-500"
						>
							Continue With Google
						</a>
					</section>
				)}

				<section className="mt-8 grid gap-4 rounded-2xl border border-slate-200 p-6 text-sm text-slate-600 md:grid-cols-2">
					<div>
						<div className="flex items-center gap-2">
							<p className="font-semibold text-slate-900">MCP Endpoint</p>
							<CopyButton text={mcpEndpoint} />
						</div>
						<code className="mt-1 block text-xs text-sky-700">{mcpEndpoint}</code>
					</div>
					<div>
						<p className="font-semibold text-slate-900">Authorization Metadata</p>
						<code className="mt-1 block text-xs text-sky-700">
							{props.baseUrl}/.well-known/oauth-authorization-server
						</code>
					</div>
				</section>
			</div>
		</main>
	);
}
