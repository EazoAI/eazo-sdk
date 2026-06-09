"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as React from "react";

import type { AuthScope } from "../../types";
import {
  _approveProfileConsent,
  _denyProfileConsent,
} from "../capabilities/auth";
import { store } from "../store";
import { ensureStylesInjected } from "../login-ui/styles";
import { CloseIcon, MailIcon } from "../login-ui/icons";
import { ensureConsentStylesInjected } from "./styles";

function useProfileConsentUI() {
  return React.useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().profileConsentUI,
    () => store.getSnapshot().profileConsentUI,
  );
}

const SCOPE_COPY: Record<AuthScope, { title: string; desc: string }> = {
  profile: {
    title: "Name & avatar",
    desc: "Your display name and profile picture, used to personalize the app.",
  },
  email: {
    title: "Email address",
    desc: "Your email, e.g. for receipts, sign-in, or updates.",
  },
  phone: {
    title: "Phone number",
    desc: "Your phone number.",
  },
};

function ScopeIcon({ scope }: { scope: AuthScope }): React.ReactElement {
  if (scope === "email") return <MailIcon size={18} />;
  return <PersonIcon />;
}

function PersonIcon(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M4 20c0-3.314 3.582-6 8-6s8 2.686 8 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * WeChat-style profile-consent popup (web path). Opened by
 * `auth.requestProfile(scopes)`; the host renders a native sheet on mobile,
 * so this only mounts/opens on plain web.
 */
export function ProfileConsentUI(): React.ReactElement | null {
  const ui = useProfileConsentUI();

  React.useEffect(() => {
    ensureStylesInjected();
    ensureConsentStylesInjected();
  }, []);

  if (typeof document === "undefined") return null;

  const onOpenChange = (next: boolean): void => {
    if (!next) _denyProfileConsent("user dismissed consent");
  };

  return (
    <Dialog.Root open={ui.open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="eazo-overlay" />
        <Dialog.Content className="eazo-content" aria-describedby={undefined}>
          <Dialog.Close className="eazo-close" aria-label="Close">
            <CloseIcon size={16} />
          </Dialog.Close>

          <div className="eazo-header">
            <Dialog.Title className="eazo-title">Allow access?</Dialog.Title>
            <Dialog.Description className="eazo-subtitle">
              This app is requesting your profile details.
            </Dialog.Description>
          </div>

          <div className="eazo-body">
            <div className="eazo-consent-list">
              {ui.scopes.map((scope) => {
                const copy = SCOPE_COPY[scope];
                return (
                  <div key={scope} className="eazo-consent-item">
                    <span className="eazo-consent-item-icon">
                      <ScopeIcon scope={scope} />
                    </span>
                    <span className="eazo-consent-item-text">
                      <span className="eazo-consent-item-title">{copy.title}</span>
                      <span className="eazo-consent-item-desc">{copy.desc}</span>
                    </span>
                  </div>
                );
              })}
            </div>

            {ui.error ? <div className="eazo-error">{ui.error}</div> : null}

            <div className="eazo-consent-actions">
              <button
                type="button"
                className="eazo-secondary-btn"
                onClick={() => _denyProfileConsent("user denied consent")}
                disabled={ui.submitting}
              >
                Not now
              </button>
              <button
                type="button"
                className="eazo-primary-btn"
                onClick={() => _approveProfileConsent()}
                disabled={ui.submitting}
              >
                {ui.submitting ? "Granting…" : "Allow"}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
