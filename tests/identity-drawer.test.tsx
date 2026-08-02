/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IdentityDrawer } from "@/components/identity/drawer";

describe("IdentityDrawer", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.stubGlobal(
      "requestAnimationFrame",
      (callback: FrameRequestCallback) => {
        callback(0);
        return 0;
      }
    );
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.body.style.overflow = "";
    document.body.style.paddingRight = "";
    document
      .querySelectorAll(".identity-drawer-layer")
      .forEach((node) => node.remove());
    vi.unstubAllGlobals();
  });

  it("portals the drawer directly under document.body", () => {
    act(() => {
      root.render(
        <IdentityDrawer
          open
          title="Choose coaching intelligence level"
          description="Select how much AI-supported preparation you would like."
          onClose={() => undefined}
          footer={<button type="button">Save approach</button>}
        >
          <p>Option content</p>
        </IdentityDrawer>
      );
    });

    const layer = document.body.querySelector(".identity-drawer-layer");
    expect(layer).not.toBeNull();
    expect(layer?.parentElement).toBe(document.body);
    expect(container.querySelector(".identity-drawer-layer")).toBeNull();
  });

  it("keeps options inside the scrollable content region only", () => {
    act(() => {
      root.render(
        <IdentityDrawer
          open
          title="Choose coaching intelligence level"
          onClose={() => undefined}
          footer={<button type="button">Save approach</button>}
        >
          <fieldset className="intelligence-options">
            <legend>Coaching intelligence level</legend>
            <label>Manual</label>
          </fieldset>
        </IdentityDrawer>
      );
    });

    const drawer = document.body.querySelector(".identity-drawer");
    const header = drawer?.querySelector(":scope > .identity-drawer-header");
    const content = drawer?.querySelector(":scope > .identity-drawer-content");
    const footer = drawer?.querySelector(":scope > .identity-drawer-footer");

    expect(header).not.toBeNull();
    expect(content).not.toBeNull();
    expect(footer).not.toBeNull();
    expect(content?.querySelector(".intelligence-options")).not.toBeNull();
    expect(header?.querySelector(".intelligence-options")).toBeNull();
    expect(footer?.querySelector(".intelligence-options")).toBeNull();
  });

  it("resets content scroll position when the drawer opens", () => {
    const scrollTo = vi.fn();
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      Element.prototype,
      "scrollTo"
    );

    Object.defineProperty(Element.prototype, "scrollTo", {
      configurable: true,
      writable: true,
      value: scrollTo,
    });

    try {
      act(() => {
        root.render(
          <IdentityDrawer
            open
            title="Choose coaching intelligence level"
            onClose={() => undefined}
            footer={<button type="button">Cancel</button>}
          >
            <div>Tall options</div>
          </IdentityDrawer>
        );
      });

      expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
      scrollTo.mockClear();

      act(() => {
        root.render(
          <IdentityDrawer
            open={false}
            title="Choose coaching intelligence level"
            onClose={() => undefined}
            footer={<button type="button">Cancel</button>}
          >
            <div>Tall options</div>
          </IdentityDrawer>
        );
      });

      act(() => {
        root.render(
          <IdentityDrawer
            open
            title="Choose coaching intelligence level"
            onClose={() => undefined}
            footer={<button type="button">Cancel</button>}
          >
            <div>Tall options</div>
          </IdentityDrawer>
        );
      });

      expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(Element.prototype, "scrollTo", originalDescriptor);
      } else {
        delete (Element.prototype as { scrollTo?: unknown }).scrollTo;
      }
    }
  });

  it("locks body scroll and restores it on close", () => {
    act(() => {
      root.render(
        <IdentityDrawer
          open
          title="Choose coaching intelligence level"
          onClose={() => undefined}
          footer={<button type="button">Cancel</button>}
        >
          <p>Options</p>
        </IdentityDrawer>
      );
    });

    expect(document.body.style.overflow).toBe("hidden");

    act(() => {
      root.render(
        <IdentityDrawer
          open={false}
          title="Choose coaching intelligence level"
          onClose={() => undefined}
          footer={<button type="button">Cancel</button>}
        >
          <p>Options</p>
        </IdentityDrawer>
      );
    });

    expect(document.body.style.overflow).toBe("");
  });

  it("returns focus to the trigger on Escape", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Change";
    document.body.appendChild(trigger);
    const triggerRef = { current: trigger };
    const onClose = vi.fn(() => {
      act(() => {
        root.render(
          <IdentityDrawer
            open={false}
            title="Choose coaching intelligence level"
            onClose={onClose}
            triggerRef={triggerRef}
            footer={<button type="button">Cancel</button>}
          >
            <p>Options</p>
          </IdentityDrawer>
        );
      });
    });

    act(() => {
      root.render(
        <IdentityDrawer
          open
          title="Choose coaching intelligence level"
          onClose={onClose}
          triggerRef={triggerRef}
          footer={<button type="button">Cancel</button>}
        >
          <p>Options</p>
        </IdentityDrawer>
      );
    });

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });

    expect(onClose).toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
