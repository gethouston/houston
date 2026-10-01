import { deepStrictEqual } from "node:assert";
import { it } from "node:test";
import {
  QueryClient,
  QueryClientProvider,
  type UseQueryOptions,
  useQuery,
} from "@tanstack/react-query";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { surveyKey, surveyQueryOptions } from "../src/hooks/survey-query.ts";
import type { OnboardingSurveyPreference } from "../src/lib/onboarding-survey.ts";

type Options = UseQueryOptions<OnboardingSurveyPreference | null>;

/** The console errors one render of a reader with `options` logs. */
function errorsOf(options: Options): string[] {
  const logged: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => logged.push(String(args[0]));
  try {
    function Reader() {
      useQuery(options);
      return null;
    }
    renderToStaticMarkup(
      React.createElement(
        QueryClientProvider,
        { client: new QueryClient() },
        React.createElement(Reader),
      ),
    );
  } finally {
    console.error = original;
  }
  return logged;
}

it("a reader of the survey record carries its load, so react-query has nothing to report", () => {
  deepStrictEqual(
    errorsOf({ ...surveyQueryOptions("u1", async () => null), enabled: false }),
    [],
  );
});

it("a reader without the load is what react-query reports on every render", () => {
  const [logged] = errorsOf({ queryKey: surveyKey("u1"), enabled: false });
  deepStrictEqual(logged?.includes("No queryFn was passed"), true);
});
