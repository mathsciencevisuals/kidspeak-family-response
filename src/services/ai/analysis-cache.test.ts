import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryRedisAdapter } from "../../repositories/redisAdapter";
import { AnalysisCache, createInputHash } from "./analysis-cache";

test("input hash is stable for equivalent transcript whitespace", () => {
  const first = createInputHash({
    transcript: "Parent: Hello\nChild: Hi",
    situationType: "homework_conflict",
    childAgeRange: "9-12",
  });
  const second = createInputHash({
    transcript: " parent: hello child: hi ",
    situationType: "homework_conflict",
    childAgeRange: "9-12",
  });
  assert.equal(first, second);
});

test("analysis cache stores and reuses output by job type and hash", async () => {
  const cache = new AnalysisCache(new InMemoryRedisAdapter());
  const inputHash = createInputHash({
    transcript: "Parent: Try again",
    situationType: "homework_conflict",
    childAgeRange: "9-12",
  });

  await cache.set({
    sessionId: "session-1",
    jobType: "graph",
    inputHash,
    provider: "rule_based",
    output: { nodes: 2 },
  });

  const cached = await cache.get<{ nodes: number }>("graph", inputHash);
  assert.equal(cached?.output.nodes, 2);
  assert.equal(cached?.provider, "rule_based");
});
