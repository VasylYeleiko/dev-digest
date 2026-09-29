import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import common from "../../messages/en/common.json";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import RouteError from "./error";
import NotFound from "./not-found";

afterEach(() => {
  cleanup();
  push.mockClear();
});

function withIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ common }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("root error boundary", () => {
  it("shows a retryable error screen and calls reset on retry", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reset = vi.fn();
    withIntl(<RouteError error={new Error("boom")} reset={reset} />);

    expect(screen.getByRole("alert")).toHaveTextContent(common.errorPage.title);
    fireEvent.click(screen.getByRole("button"));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

describe("root not-found page", () => {
  it("explains the 404 and links back to the dashboard", () => {
    withIntl(<NotFound />);
    expect(screen.getByText(common.notFound.title)).toBeInTheDocument();
    fireEvent.click(screen.getByText(common.notFound.cta));
    expect(push).toHaveBeenCalledWith("/");
  });
});
