# New MCP App

Step-by-step guide for adding a new MCP App (interactive HTML interface rendered in sandboxed iframes).

## Steps

1. **Create the app component**
   - Create `packages/mcp-apps/src/applications/{app-name}/{app-name}.tsx`
   - Use React + Tailwind for styling
   - The component will be compiled to a self-contained HTML string by the build pipeline

2. **Add the package.json export**
   - In `packages/mcp-apps/package.json`, add: `"./{app-name}": "./dist/{app-name}.js"`

3. **Build the app**
   - Run `bun turbo build` from the root to compile the app into `packages/mcp-apps/dist/{app-name}.js`
   - Type declarations are auto-generated during build (`dist/{app-name}.d.ts`). Ensure `@template/mcp-apps` is built before importing.

4. **Create a resource for the app HTML**
   - Create `packages/mcp/src/resources/{app-name}.ts`
   - Import the built HTML: `import html from '@template/mcp-apps/{app-name}'`
   - Use `RESOURCE_MIME_TYPE` from `@modelcontextprotocol/ext-apps/server` for the mimeType
   - Resource URI: `ui://{app-name}`

5. **Create a tool that references the app**
   - Create `packages/mcp/src/tools/{app-name}.ts`
   - Include `_meta: { ui: { resourceUri: 'ui://{app-name}' } }` in the tool registration metadata

6. **Optionally add app-only tools**
   - These are callable by the app via `callServerTool()` but hidden from the LLM
   - Use `visibility: ['app']` in `_meta.ui`

7. **Register everything**
   - Register the resource and tool(s) in `packages/mcp/src/server.ts`
   - Re-export from `packages/mcp/src/index.ts`
