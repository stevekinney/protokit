import { describe, expect, it } from 'bun:test';
import { parseAllowedOrigins } from '@web/lib/mcp-origin-validation';

describe('parseAllowedOrigins', () => {
	it('defaults to http://localhost:3000 when unset', () => {
		expect(parseAllowedOrigins(undefined)).toEqual(new Set(['http://localhost:3000']));
	});

	it('splits a comma-separated list and trims whitespace', () => {
		expect(parseAllowedOrigins(' https://a.example, https://b.example ,,')).toEqual(
			new Set(['https://a.example', 'https://b.example']),
		);
	});

	it('canonicalizes a trailing slash so a browser-address-bar copy-paste still matches (round-14 review)', () => {
		expect(parseAllowedOrigins('https://claude.ai/')).toEqual(new Set(['https://claude.ai']));
	});

	it('drops the trailing-slash form and the canonical form to the same single entry when both are configured', () => {
		expect(parseAllowedOrigins('https://claude.ai/,https://claude.ai')).toEqual(
			new Set(['https://claude.ai']),
		);
	});

	it('lowercases the scheme and host, matching the canonical form a real Origin header always uses', () => {
		expect(parseAllowedOrigins('HTTPS://Claude.AI')).toEqual(new Set(['https://claude.ai']));
	});

	it('preserves a non-default port', () => {
		expect(parseAllowedOrigins('http://localhost:5173/')).toEqual(
			new Set(['http://localhost:5173']),
		);
	});

	it('drops an entry carrying a real path -- an Origin header can never contain one', () => {
		expect(parseAllowedOrigins('https://claude.ai/callback')).toEqual(new Set());
	});

	it('drops an entry carrying a query string', () => {
		expect(parseAllowedOrigins('https://claude.ai?x=1')).toEqual(new Set());
	});

	it('drops an entry carrying a fragment', () => {
		expect(parseAllowedOrigins('https://claude.ai#section')).toEqual(new Set());
	});

	it('drops an entry carrying embedded userinfo', () => {
		expect(parseAllowedOrigins('https://user:pass@claude.ai')).toEqual(new Set());
	});

	it('drops an entry using a non-http(s) scheme', () => {
		expect(parseAllowedOrigins('ftp://claude.ai')).toEqual(new Set());
	});

	it('drops an entry that is not a parseable URL at all', () => {
		expect(parseAllowedOrigins('not a url')).toEqual(new Set());
	});

	it('keeps every other well-formed entry when one entry in the list is malformed', () => {
		expect(parseAllowedOrigins('https://claude.ai/callback,https://a.example')).toEqual(
			new Set(['https://a.example']),
		);
	});
});
