import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { usePolledCount } from "./usePolledCount.js";

afterEach(() => vi.useRealTimers());

describe("usePolledCount", () => {
  it("does not fetch while disabled", () => {
    const f = vi.fn().mockResolvedValue(3);
    renderHook(() => usePolledCount(f, false, 1000));
    expect(f).not.toHaveBeenCalled();
  });

  it("fetches immediately when enabled and exposes the count", async () => {
    const f = vi.fn().mockResolvedValue(5);
    const { result } = renderHook(() => usePolledCount(f, true, 100_000));
    await waitFor(() => expect(result.current).toBe(5));
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("re-polls on the interval", async () => {
    vi.useFakeTimers();
    const f = vi.fn().mockResolvedValue(1);
    renderHook(() => usePolledCount(f, true, 1000));
    expect(f).toHaveBeenCalledTimes(1); // the immediate load
    await vi.advanceTimersByTimeAsync(1000);
    expect(f).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(f).toHaveBeenCalledTimes(3);
  });
});
