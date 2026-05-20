import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryRedisAdapter } from "../../repositories/redisAdapter";
import { RateLimiter } from "./rate-limiter";

test("rate limiter blocks after daily family analysis limit", async () => {
  process.env.DAILY_ANALYSIS_LIMIT_PER_FAMILY = "2";
  const limiter = new RateLimiter(new InMemoryRedisAdapter());

  assert.equal((await limiter.checkAndIncrement({ familyId: "family-1", purpose: "family_analysis" })).allowed, true);
  assert.equal((await limiter.checkAndIncrement({ familyId: "family-1", purpose: "family_analysis" })).allowed, true);
  const blocked = await limiter.checkAndIncrement({ familyId: "family-1", purpose: "family_analysis" });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.count, 2);
});

test("rate limiter allows admin override without incrementing", async () => {
  process.env.DAILY_AI_PERSONALIZATION_LIMIT = "1";
  const limiter = new RateLimiter(new InMemoryRedisAdapter());

  assert.equal((await limiter.checkAndIncrement({ familyId: "family-2", purpose: "ai_personalization" })).allowed, true);
  assert.equal((await limiter.checkAndIncrement({ familyId: "family-2", purpose: "ai_personalization" })).allowed, false);
  const override = await limiter.checkAndIncrement({
    familyId: "family-2",
    purpose: "ai_personalization",
    adminOverride: true,
  });
  assert.equal(override.allowed, true);
  assert.equal(override.adminOverride, true);
});
