import type { z } from 'zod';
import type {
	CallToolResult,
	GetPromptResult,
	ReadResourceResult,
} from '@modelcontextprotocol/server';

export type McpUserProfile = {
	id: string;
	email: string;
	name: string;
	image: string | null;
	role: string;
};

export type McpContext = {
	userId: string;
	user: McpUserProfile;
};

/**
 * META-001: the four tool-safety hints the `2026-07-28` era gives real
 * weight to. All four are required (not optional) so a tool definition
 * that omits one is a compile-time error, not a silent gap a reviewer has
 * to notice by hand.
 */
export type McpToolAnnotations = {
	/** The tool only reads data; it never mutates state. */
	readOnlyHint: boolean;
	/** Calling the tool can cause irreversible or destructive effects. */
	destructiveHint: boolean;
	/** Calling the tool twice with the same input has no additional effect. */
	idempotentHint: boolean;
	/** The tool interacts with an open-ended external world, not a fixed set of resources. */
	openWorldHint: boolean;
};

/**
 * META-001: `title`, `description`, and `annotations` are required (not
 * optional), which is what turns "forgot to add metadata" into a
 * `tsc` failure on the tool's own file instead of a silent gap discovered
 * later against a live connector. `outputSchema` stays optional — a tool
 * with no structured result genuinely has none to declare — but when it
 * is present the handler's return type is checked against it, so a
 * mismatched `structuredContent` is also a compile-time error.
 *
 * `InputSchema`/`OutputSchema` default to the widest legal type so
 * `McpToolDefinition` (no type arguments) can still be used as the
 * element type of a heterogeneous `allTools` array; individual tool
 * files should let `defineTool` infer their concrete schema types instead
 * of writing the type arguments out by hand.
 */
export type McpToolDefinition<
	InputSchema extends z.ZodType = z.ZodType,
	OutputSchema extends z.ZodType | undefined = z.ZodType | undefined,
> = {
	name: string;
	title: string;
	description: string;
	inputSchema: InputSchema;
	outputSchema?: OutputSchema;
	annotations: McpToolAnnotations;
	/** MCP Apps UI metadata (`_meta.ui.resourceUri`, `_meta.ui.visibility`). See the package `CLAUDE.md`. */
	_meta?: Record<string, unknown>;
	// Method shorthand (not an arrow-typed property) is deliberate: it keeps
	// parameter checking bivariant, which is what lets a concretely-typed
	// tool (e.g. `McpToolDefinition<GetUserProfileInput, GetUserProfileOutput>`)
	// be stored in an `McpToolDefinition[]` array without every tool file
	// having to widen its own handler's input type by hand.
	handler(
		input: z.infer<InputSchema>,
		context: McpContext,
	): Promise<
		OutputSchema extends z.ZodType
			? // The SDK only validates `structuredContent` against `outputSchema`
				// on a success result — an `isError: true` result is exempt (it
				// legitimately has no structured payload to validate), so this is
				// optional rather than required even though a declared
				// `outputSchema` obligates it on every non-error return.
				CallToolResult & { structuredContent?: z.infer<OutputSchema> }
			: CallToolResult
	>;
};

/**
 * Identity helper that exists only for inference: writing
 * `export const fooTool = defineTool({ ... })` lets TypeScript infer
 * `InputSchema`/`OutputSchema` from the literal `inputSchema`/`outputSchema`
 * values instead of the author spelling out `McpToolDefinition<X, Y>` by
 * hand on every tool.
 */
export function defineTool<
	InputSchema extends z.ZodType,
	OutputSchema extends z.ZodType | undefined = undefined,
>(
	definition: McpToolDefinition<InputSchema, OutputSchema>,
): McpToolDefinition<InputSchema, OutputSchema> {
	return definition;
}

export type McpResourceDefinition = {
	name: string;
	title: string;
	uri: string;
	description: string;
	mimeType: string;
	handler(uri: URL, context: McpContext): Promise<ReadResourceResult>;
};

export type McpPromptDefinition<
	Arguments extends Record<string, z.ZodType> | undefined = Record<string, z.ZodType> | undefined,
> = {
	name: string;
	title: string;
	description: string;
	// Required (not optional) so a prompt with no arguments has to spell
	// out `arguments: undefined` — an omitted key here reads as "forgot
	// to define the schema," not "intentionally none."
	arguments: Arguments;
	handler(
		arguments_: Arguments extends Record<string, z.ZodType>
			? { [Key in keyof Arguments]: z.infer<Arguments[Key]> }
			: Record<string, never>,
		context: McpContext,
	): Promise<GetPromptResult>;
};

export function definePrompt<Arguments extends Record<string, z.ZodType> | undefined>(
	definition: McpPromptDefinition<Arguments>,
): McpPromptDefinition<Arguments> {
	return definition;
}
