import type { RedisClientType } from 'redis';
import type { AtomicSlidingWindowStore } from '@web/lib/sliding-window-rate-limiter';

/**
 * Removes expired members, counts what remains, and — only if under the
 * limit — admits the new member and refreshes the key's expiry, all inside
 * one Lua script executed atomically by Redis (`EVAL` runs the whole script
 * as a single operation; no other client can observe or interleave with an
 * intermediate state). Returns `{allowed, retryAfterMilliseconds, remainingRequests}`
 * as a three-element array.
 */
const consumeScript = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local max_requests = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
local count = redis.call('ZCARD', key)

if count >= max_requests then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local retry_after = window
  if oldest[2] ~= nil then
    retry_after = tonumber(oldest[2]) + window - now
    if retry_after < 0 then
      retry_after = 0
    end
  end
  return {0, retry_after, 0}
end

redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, window)
return {1, 0, max_requests - count - 1}
`;

const peekScript = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])

redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
return redis.call('ZCARD', key)
`;

/**
 * Serializes a numeric script argument, refusing anything non-finite.
 *
 * Redis implements Lua's `tonumber` with `strtod`, which parses `"NaN"` and
 * `"Infinity"` as genuine float values rather than returning nil. A `NaN`
 * window therefore reaches `ZREMRANGEBYSCORE` as a score and Redis rejects the
 * whole script with `ERR min or max is not a float`, turning every rate-limited
 * route into a 500. Refuse the value here, at the boundary that would otherwise
 * launder it into the script, so a misconfigured limit fails loudly and
 * locally instead of as an opaque Redis error.
 */
function serializeFiniteScriptArgument(value: number, parameterName: string): string {
	if (!Number.isFinite(value)) {
		throw new TypeError(
			`Rate limiter received a non-finite ${parameterName} (${String(value)}). ` +
				'This indicates missing or unparsed rate-limit configuration, not a Redis fault.',
		);
	}

	return String(value);
}

export function createRedisSlidingWindowStore(
	redisClient: RedisClientType,
): AtomicSlidingWindowStore {
	return {
		consume: async (input) => {
			const reply = (await redisClient.eval(consumeScript, {
				keys: [input.key],
				arguments: [
					serializeFiniteScriptArgument(input.nowMilliseconds, 'nowMilliseconds'),
					serializeFiniteScriptArgument(input.windowMilliseconds, 'windowMilliseconds'),
					serializeFiniteScriptArgument(input.maximumRequests, 'maximumRequests'),
					input.member,
				],
			})) as [number, number, number];

			const [allowedFlag, retryAfterMilliseconds, remainingRequests] = reply;
			return {
				allowed: allowedFlag === 1,
				retryAfterMilliseconds: Number(retryAfterMilliseconds),
				remainingRequests: Number(remainingRequests),
			};
		},

		peek: async (input) => {
			const reply = (await redisClient.eval(peekScript, {
				keys: [input.key],
				arguments: [
					serializeFiniteScriptArgument(input.nowMilliseconds, 'nowMilliseconds'),
					serializeFiniteScriptArgument(input.windowMilliseconds, 'windowMilliseconds'),
				],
			})) as number;

			return Number(reply);
		},
	};
}
