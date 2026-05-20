import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionDetailScreen } from "../App";

test("session detail does not render an audio player when raw audio storage is disabled", () => {
  process.env.STORE_RAW_AUDIO = "false";
  const markup = renderToStaticMarkup(React.createElement(SessionDetailScreen, { sessionId: "session-002" }));

  assert.equal(markup.includes("<audio"), false);
  assert.equal(markup.includes("audioStored"), true);
  assert.equal(markup.includes("uploaded_audio_transient"), true);
});
