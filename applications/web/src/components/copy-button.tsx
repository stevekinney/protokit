import { type JSX, useState } from 'react';

type CopyButtonProps = {
	text: string;
};

export function CopyButton(props: CopyButtonProps): JSX.Element {
	const [copied, setCopied] = useState(false);

	function handleClick() {
		navigator.clipboard.writeText(props.text).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		});
	}

	return (
		<button
			type="button"
			onClick={handleClick}
			className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
		>
			{copied ? 'Copied!' : 'Copy'}
		</button>
	);
}
