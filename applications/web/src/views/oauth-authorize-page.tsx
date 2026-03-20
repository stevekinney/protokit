import type { JSX } from 'react';
import type { ApplicationUser } from '@web/lib/session-authentication';

type OAuthAuthorizePageInput =
	| {
			mode: 'error';
			error: string;
	  }
	| {
			mode: 'form';
			clientName: string;
			clientId: string;
			redirectUri: string;
			codeChallenge: string;
			codeChallengeMethod: string;
			state: string;
			user: ApplicationUser;
	  };

export function OauthAuthorizePage(input: OAuthAuthorizePageInput): JSX.Element {
	if (input.mode === 'error') {
		return (
			<main className="mx-auto mt-12 w-full max-w-2xl px-6">
				<div className="rounded-3xl border border-rose-200 bg-rose-50 p-8">
					<h1 className="text-2xl font-black text-rose-900">Authorization Error</h1>
					<p className="mt-3 text-rose-700">{input.error}</p>
					<a className="mt-6 inline-block text-sm font-semibold text-rose-700 underline" href="/">
						Back to home
					</a>
				</div>
			</main>
		);
	}

	return (
		<main className="mx-auto mt-12 w-full max-w-3xl px-6">
			<div className="rounded-3xl border border-slate-200 bg-white p-10 shadow-lg shadow-slate-200/40">
				<p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-700">
					OAuth Consent
				</p>
				<h1 className="mt-3 text-3xl font-black text-slate-900">Authorize {input.clientName}</h1>
				<p className="mt-4 text-slate-600">
					{input.clientName} is requesting access as{' '}
					<strong className="text-slate-900">{input.user.email}</strong>.
				</p>

				<div className="mt-8 flex flex-wrap items-center gap-4">
					<form method="POST" action="/oauth/authorize/approve" className="inline">
						<input type="hidden" name="client_id" value={input.clientId} />
						<input type="hidden" name="redirect_uri" value={input.redirectUri} />
						<input type="hidden" name="code_challenge" value={input.codeChallenge} />
						<input type="hidden" name="code_challenge_method" value={input.codeChallengeMethod} />
						<input type="hidden" name="state" value={input.state} />
						<button
							type="submit"
							className="rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-500"
						>
							Approve
						</button>
					</form>

					<form method="POST" action="/oauth/authorize/deny" className="inline">
						<input type="hidden" name="client_id" value={input.clientId} />
						<input type="hidden" name="redirect_uri" value={input.redirectUri} />
						<input type="hidden" name="state" value={input.state} />
						<button
							type="submit"
							className="rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
						>
							Deny
						</button>
					</form>
				</div>
			</div>
		</main>
	);
}
