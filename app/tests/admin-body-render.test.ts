import { doesNotMatch, match, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { Skeleton } from "@houston-ai/core";
import { Children, createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminBody } from "../src/components/organization/admin-body.tsx";

const render = (state: "pending" | "unavailable" | "ready") =>
  renderToStaticMarkup(
    createElement(
      AdminBody,
      { state, loadingLabel: "Loading", unavailableLabel: "Unavailable" },
      createElement("span", null, "Organization sections"),
    ),
  );

describe("Admin body rendering", () => {
  it("renders a labelled skeleton while pending", () => {
    const element = AdminBody({
      state: "pending",
      loadingLabel: "Loading",
      unavailableLabel: "Unavailable",
      children: createElement("span", null, "Organization sections"),
    });
    ok(
      isValidElement<{
        "aria-busy": string;
        "aria-label": string;
        children: unknown;
      }>(element),
    );
    strictEqual(element.props["aria-busy"], "true");
    strictEqual(element.props["aria-label"], "Loading");
    const children = Children.toArray(element.props.children);
    ok(
      children.some(
        (child) => isValidElement(child) && child.type === Skeleton,
      ),
    );
  });

  it("renders the unavailable line after a failure without data", () => {
    const html = render("unavailable");
    match(html, /Unavailable/);
    doesNotMatch(html, /Organization sections|aria-busy/);
  });

  it("renders the sections when ready", () => {
    const html = render("ready");
    match(html, /Organization sections/);
    doesNotMatch(html, /Unavailable|aria-busy/);
  });
});
