/**
 * WaitlistButton - CTA button for joining the Copilot Tasks waitlist.
 *
 * Handles four states:
 * - "signIn": User is not signed in, clicking redirects to sign-in
 * - "default": User is signed in but hasn't joined, clicking joins the waitlist
 * - "confirmation": Brief "You're on the list!" state after joining
 * - "joined": User is already on the waitlist / enrolled
 *
 * Also handles resuming a pending join after sign-in redirect.
 */

import React, { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useTemplateConfig } from "@/template/useTemplateConfig";
import { useIsAuthenticated, useSignIn } from "@/lib/auth";
import {
  getSessionStorageValue,
  clearSessionStorageValue,
  setSessionStorageValue,
} from "@/lib/session";
import { setRedirectPath } from "@/lib/routing";
import { trackWaitlistJoin } from "@/lib/telemetry";
import {
  WAITLIST_PROGRAM,
  JOIN_CONFIRMATION_DURATION_MS,
  PENDING_JOIN_EXPIRY_MS,
} from "../constants";
import { useWaitlistStatus, useJoinWaitlist } from "../api/waitlist";
import type { ButtonPlacement, ButtonState } from "../types";

// Button style variants

const BUTTON_STYLES: Record<ButtonPlacement, { size: string; idle: string; disabled: string }> = {
  home: {
    size: "px-5 py-3 text-base-dense",
    idle: "bg-background-800 text-foreground-100 focus-visible:bg-black safe-hover:bg-black dark:bg-background-100 dark:text-foreground-900 dark:focus-visible:bg-background-150 dark:safe-hover:bg-background-150",
    disabled:
      "pointer-events-none bg-background-350/40 text-foreground-900 dark:bg-background-200/75 dark:text-foreground-700",
  },
  floating: {
    size: "px-6 py-3 text-base-dense",
    idle: "bg-background-800 text-foreground-100 focus-visible:bg-black safe-hover:bg-black dark:bg-background-300 dark:text-foreground-900 dark:focus-visible:bg-background-300/80 dark:safe-hover:bg-background-300/80",
    disabled:
      "pointer-events-none bg-background-350/40 text-foreground-900 dark:bg-background-250/75 dark:text-foreground-700",
  },
  footer: {
    size: "px-7 py-3.5 text-md",
    idle: "bg-white text-foreground-800 dark:text-foreground-200 focus-visible:bg-white/90 safe-hover:bg-white/90",
    disabled: "pointer-events-none bg-white/60 text-foreground-800",
  },
};

// Helpers

function getButtonState(status: string | undefined, showingConfirmation: boolean): ButtonState {
  if (showingConfirmation) return "confirmation";
  if (status === "waitlisted" || status === "enrolled") return "joined";
  return "default";
}

// Component

interface WaitlistButtonProps {
  placement?: ButtonPlacement;
}

export function WaitlistButton({ placement = "home" }: WaitlistButtonProps) {
  const template = useTemplateConfig();
  const isAuthenticated = useIsAuthenticated();
  const { status, isLoading } = useWaitlistStatus(WAITLIST_PROGRAM);
  const { join, isPending, isError } = useJoinWaitlist(WAITLIST_PROGRAM);
  const signIn = useSignIn({
    from: "/tasks/preview",
    scenario: "tasksPreviewSignIn",
    loginScenario: "tasksPreview",
  });

  const [showingConfirmation, setShowingConfirmation] = useState(false);
  const confirmationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasPendingRef = useRef(false);
  const hasAttemptedResumeRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || isLoading || hasAttemptedResumeRef.current) return;

    const pendingTimestamp = getSessionStorageValue("pendingTaskWaitlistJoin");
    clearSessionStorageValue("pendingTaskWaitlistJoin");

    if (
      !pendingTimestamp ||
      Date.now() - pendingTimestamp > PENDING_JOIN_EXPIRY_MS ||
      status === "waitlisted" ||
      status === "enrolled"
    ) {
      return;
    }

    hasAttemptedResumeRef.current = true;

    const timer = setTimeout(() => {
      setShowingConfirmation(true);
    }, 0);

    join();

    return () => clearTimeout(timer);
  }, [isAuthenticated, isLoading, status, join]);

  useEffect(() => {
    if (isPending) {
      wasPendingRef.current = true;
      return;
    }

    if (!wasPendingRef.current) return;
    wasPendingRef.current = false;

    const hideDelay = isError ? 0 : JOIN_CONFIRMATION_DURATION_MS;

    confirmationTimerRef.current = setTimeout(() => {
      setShowingConfirmation(false);
    }, hideDelay);

    return () => {
      if (confirmationTimerRef.current) {
        clearTimeout(confirmationTimerRef.current);
      }
    };
  }, [isPending, isError]);

  const buttonState: ButtonState = isAuthenticated
    ? getButtonState(status, showingConfirmation)
    : "signIn";
  const buttonLabels: Record<ButtonState, string> = {
    default: template.cta.join,
    confirmation: template.cta.joinConfirmation,
    joined: template.cta.returning,
    signIn: template.cta.signIn,
  };

  const { size, idle, disabled } = BUTTON_STYLES[placement];
  const isDisabled = isAuthenticated && (buttonState !== "default" || isLoading);

  function handleClick() {
    if (isDisabled) return;

    trackWaitlistJoin(placement);

    if (!isAuthenticated) {
      setSessionStorageValue("pendingTaskWaitlistJoin", Date.now());
      setRedirectPath({ to: "/tasks/preview" });
      signIn();
      return;
    }

    setShowingConfirmation(true);
    join();
  }

  return (
    <>
      {/* Live region for screen readers */}
      <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {isDisabled ? buttonLabels[buttonState] : ""}
      </span>

      <button
        type="button"
        disabled={isDisabled}
        onClick={handleClick}
        className={cn(
          "min-w-44 rounded-full select-none active:opacity-80",
          size,
          isDisabled ? disabled : idle,
        )}
      >
        {buttonLabels[buttonState]}
      </button>
    </>
  );
}
