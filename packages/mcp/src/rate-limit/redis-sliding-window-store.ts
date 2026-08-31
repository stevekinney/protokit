import type { AtomicSlidingWindowStore, MinimalRedisClient } from '../oauth/index.js';

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
    if retry_after < 0 then retry_after = 0 end
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
	redisClient: MinimalRedisClient,
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
			return {
				allowed: reply[0] === 1,
				retryAfterMilliseconds: Number(reply[1]),
				remainingRequests: Number(reply[2]),
			};
		},
		peek: async (input) =>
			Number(
				await redisClient.eval(peekScript, {
					keys: [input.key],
					arguments: [
						serializeFiniteScriptArgument(input.nowMilliseconds, 'nowMilliseconds'),
						serializeFiniteScriptArgument(input.windowMilliseconds, 'windowMilliseconds'),
					],
				}),
			),
	};
}
