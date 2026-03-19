import type { BunPlugin } from 'bun';
import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';

export function createTailwindPlugin(options?: { minify?: boolean }): BunPlugin {
	return {
		name: 'tailwindcss',
		setup(build) {
			build.onLoad({ filter: /\.css$/ }, async (args) => {
				const source = await Bun.file(args.path).text();
				const result = await postcss([
					tailwindcss({ optimize: { minify: options?.minify ?? false } }),
				]).process(source, { from: args.path });
				return { contents: result.css, loader: 'css' };
			});
		},
	};
}
